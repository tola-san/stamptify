package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"gin-api/internal/domain"
	"gin-api/internal/service"
)

type QRStampRepository struct {
	db *sql.DB
}

func NewQRStampRepository(db *sql.DB) *QRStampRepository {
	return &QRStampRepository{db: db}
}

func (r *QRStampRepository) Create(
	ctx context.Context,
	customerID,
	tokenHash string,
	expiresAt,
	now time.Time,
) (domain.CustomerQRToken, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.CustomerQRToken{}, fmt.Errorf("begin customer QR creation: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		UPDATE customer_qr_tokens
		SET status = 'CANCELLED'
		WHERE customer_id = ? AND status = 'ACTIVE'
	`, customerID); err != nil {
		return domain.CustomerQRToken{}, fmt.Errorf("cancel previous customer QR: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO customer_qr_tokens (customer_id, token_hash, status, expires_at, created_at)
		VALUES (?, ?, 'ACTIVE', ?, ?)
	`, customerID, tokenHash, expiresAt.UTC(), now.UTC()); err != nil {
		return domain.CustomerQRToken{}, fmt.Errorf("insert customer QR: %w", err)
	}

	token, err := findQRTokenByHash(ctx, tx, tokenHash)
	if err != nil {
		return domain.CustomerQRToken{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.CustomerQRToken{}, fmt.Errorf("commit customer QR creation: %w", err)
	}
	return token, nil
}

func (r *QRStampRepository) GetCurrent(ctx context.Context, customerID string, now time.Time) (domain.CustomerQRToken, error) {
	var token domain.CustomerQRToken
	err := r.db.QueryRowContext(ctx, `
		SELECT id, customer_id, token_hash, status, expires_at, used_at, used_by_staff_id, created_at
		FROM customer_qr_tokens
		WHERE customer_id = ? AND status = 'ACTIVE' AND expires_at > ?
		ORDER BY created_at DESC
		LIMIT 1
	`, customerID, now.UTC()).Scan(
		&token.ID,
		&token.CustomerID,
		&token.TokenHash,
		&token.Status,
		&token.ExpiresAt,
		&token.UsedAt,
		&token.UsedByStaffID,
		&token.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.CustomerQRToken{}, domain.ErrQRTokenNotFound
	}
	if err != nil {
		return domain.CustomerQRToken{}, fmt.Errorf("get active customer QR: %w", err)
	}
	return token, nil
}

func (r *QRStampRepository) Cancel(ctx context.Context, customerID, tokenID string, now time.Time) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE customer_qr_tokens
		SET status = CASE WHEN expires_at <= ? THEN 'EXPIRED' ELSE 'CANCELLED' END
		WHERE id = ? AND customer_id = ? AND status = 'ACTIVE'
	`, now.UTC(), tokenID, customerID)
	if err != nil {
		return fmt.Errorf("cancel customer QR: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read cancelled QR count: %w", err)
	}
	if rows == 0 {
		return domain.ErrQRTokenNotFound
	}
	return nil
}

func (r *QRStampRepository) PreviewByHash(ctx context.Context, tokenHash string) (service.QRScanPreview, error) {
	var preview service.QRScanPreview
	err := r.db.QueryRowContext(ctx, `
		SELECT
			q.id, q.status, q.expires_at,
			c.id, c.name, c.phone, c.created_at, c.updated_at,
			sc.id, sc.customer_id, sc.stamp_count, sc.required_stamps, sc.created_at, sc.updated_at
		FROM customer_qr_tokens q
		JOIN customers c ON c.id = q.customer_id
		JOIN stamp_cards sc ON sc.customer_id = c.id
		WHERE q.token_hash = ?
		LIMIT 1
	`, tokenHash).Scan(
		&preview.ScanID,
		&preview.Status,
		&preview.ExpiresAt,
		&preview.Customer.ID,
		&preview.Customer.Name,
		&preview.Customer.Phone,
		&preview.Customer.CreatedAt,
		&preview.Customer.UpdatedAt,
		&preview.Card.ID,
		&preview.Card.CustomerID,
		&preview.Card.StampCount,
		&preview.Card.RequiredStamps,
		&preview.Card.CreatedAt,
		&preview.Card.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return service.QRScanPreview{}, domain.ErrQRTokenNotFound
	}
	if err != nil {
		return service.QRScanPreview{}, fmt.Errorf("preview customer QR: %w", err)
	}
	return preview, nil
}

func (r *QRStampRepository) Confirm(
	ctx context.Context,
	tokenID,
	staffID string,
	now time.Time,
) (service.StampConfirmation, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return service.StampConfirmation{}, fmt.Errorf("begin stamp confirmation: %w", err)
	}
	defer tx.Rollback()

	var result service.StampConfirmation
	var status domain.QRStatus
	var expiresAt time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT
			q.status, q.expires_at,
			c.id, c.name, c.phone, c.created_at, c.updated_at,
			sc.id, sc.customer_id, sc.stamp_count, sc.required_stamps, sc.created_at, sc.updated_at
		FROM customer_qr_tokens q
		JOIN customers c ON c.id = q.customer_id
		JOIN stamp_cards sc ON sc.customer_id = c.id
		WHERE q.id = ?
		FOR UPDATE
	`, tokenID).Scan(
		&status,
		&expiresAt,
		&result.Customer.ID,
		&result.Customer.Name,
		&result.Customer.Phone,
		&result.Customer.CreatedAt,
		&result.Customer.UpdatedAt,
		&result.Card.ID,
		&result.Card.CustomerID,
		&result.Card.StampCount,
		&result.Card.RequiredStamps,
		&result.Card.CreatedAt,
		&result.Card.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return service.StampConfirmation{}, domain.ErrQRTokenNotFound
	}
	if err != nil {
		return service.StampConfirmation{}, fmt.Errorf("lock customer QR and card: %w", err)
	}

	switch status {
	case domain.QRStatusUsed:
		return service.StampConfirmation{}, domain.ErrQRTokenUsed
	case domain.QRStatusCancelled:
		return service.StampConfirmation{}, domain.ErrQRTokenCancelled
	case domain.QRStatusExpired:
		return service.StampConfirmation{}, domain.ErrQRTokenExpired
	case domain.QRStatusActive:
		if !expiresAt.After(now) {
			if _, err := tx.ExecContext(ctx, "UPDATE customer_qr_tokens SET status = 'EXPIRED' WHERE id = ?", tokenID); err != nil {
				return service.StampConfirmation{}, fmt.Errorf("expire customer QR: %w", err)
			}
			if err := tx.Commit(); err != nil {
				return service.StampConfirmation{}, fmt.Errorf("commit expired customer QR: %w", err)
			}
			return service.StampConfirmation{}, domain.ErrQRTokenExpired
		}
	default:
		return service.StampConfirmation{}, domain.ErrQRTokenNotFound
	}
	if result.Card.StampCount >= result.Card.RequiredStamps {
		return service.StampConfirmation{}, domain.ErrStampCardFull
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE stamp_cards
		SET stamp_count = stamp_count + 1, updated_at = ?
		WHERE id = ?
	`, now.UTC(), result.Card.ID); err != nil {
		return service.StampConfirmation{}, fmt.Errorf("increment stamp card: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO stamp_transactions (customer_id, staff_id, customer_qr_token_id, type, stamp_delta)
		VALUES (?, ?, ?, 'STAMP_ADDED', 1)
	`, result.Customer.ID, staffID, tokenID); err != nil {
		if isDuplicateEntry(err) {
			return service.StampConfirmation{}, domain.ErrQRTokenUsed
		}
		return service.StampConfirmation{}, fmt.Errorf("record stamp transaction: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE customer_qr_tokens
		SET status = 'USED', used_at = ?, used_by_staff_id = ?
		WHERE id = ?
	`, now.UTC(), staffID, tokenID); err != nil {
		return service.StampConfirmation{}, fmt.Errorf("mark customer QR used: %w", err)
	}

	result.Card.StampCount++
	result.Card.UpdatedAt = now.UTC()
	result.RewardAvailable = result.Card.StampCount >= result.Card.RequiredStamps
	if err := tx.Commit(); err != nil {
		return service.StampConfirmation{}, fmt.Errorf("commit stamp confirmation: %w", err)
	}
	return result, nil
}

func findQRTokenByHash(ctx context.Context, db rowQuerier, tokenHash string) (domain.CustomerQRToken, error) {
	var token domain.CustomerQRToken
	err := db.QueryRowContext(ctx, `
		SELECT id, customer_id, token_hash, status, expires_at, used_at, used_by_staff_id, created_at
		FROM customer_qr_tokens
		WHERE token_hash = ?
	`, tokenHash).Scan(
		&token.ID,
		&token.CustomerID,
		&token.TokenHash,
		&token.Status,
		&token.ExpiresAt,
		&token.UsedAt,
		&token.UsedByStaffID,
		&token.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.CustomerQRToken{}, domain.ErrQRTokenNotFound
	}
	if err != nil {
		return domain.CustomerQRToken{}, fmt.Errorf("find customer QR: %w", err)
	}
	return token, nil
}
