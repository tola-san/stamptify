package service

import (
	"context"
	"fmt"
	"time"

	"gin-api/internal/domain"
)

const CustomerQRTokenDuration = 60 * time.Second

type QRStampStore interface {
	Create(context.Context, string, string, time.Time, time.Time) (domain.CustomerQRToken, error)
	GetCurrent(context.Context, string, time.Time) (domain.CustomerQRToken, error)
	Cancel(context.Context, string, string, time.Time) error
	PreviewByHash(context.Context, string) (QRScanPreview, error)
	Confirm(context.Context, string, string, time.Time) (StampConfirmation, error)
}

type GeneratedCustomerQR struct {
	ID        string          `json:"id"`
	Token     string          `json:"token"`
	Status    domain.QRStatus `json:"status"`
	ExpiresAt time.Time       `json:"expires_at"`
}

type QRScanPreview struct {
	ScanID    string           `json:"scan_id"`
	Customer  domain.Customer  `json:"customer"`
	Card      domain.StampCard `json:"card"`
	Status    domain.QRStatus  `json:"-"`
	ExpiresAt time.Time        `json:"expires_at"`
}

type StampConfirmation struct {
	Customer        domain.Customer  `json:"customer"`
	Card            domain.StampCard `json:"card"`
	RewardAvailable bool             `json:"reward_available"`
}

type QRStampService struct {
	store QRStampStore
	now   func() time.Time
}

func NewQRStampService(store QRStampStore) *QRStampService {
	return &QRStampService{store: store, now: time.Now}
}

func (s *QRStampService) Generate(ctx context.Context, customerID string) (GeneratedCustomerQR, error) {
	rawToken, tokenHash, err := newSessionToken()
	if err != nil {
		return GeneratedCustomerQR{}, fmt.Errorf("generate customer QR token: %w", err)
	}
	now := s.now().UTC()
	token, err := s.store.Create(ctx, customerID, tokenHash, now.Add(CustomerQRTokenDuration), now)
	if err != nil {
		return GeneratedCustomerQR{}, err
	}
	return GeneratedCustomerQR{ID: token.ID, Token: rawToken, Status: token.Status, ExpiresAt: token.ExpiresAt}, nil
}

func (s *QRStampService) GetCurrent(ctx context.Context, customerID string) (domain.CustomerQRToken, error) {
	return s.store.GetCurrent(ctx, customerID, s.now().UTC())
}

func (s *QRStampService) Cancel(ctx context.Context, customerID, tokenID string) error {
	return s.store.Cancel(ctx, customerID, tokenID, s.now().UTC())
}

func (s *QRStampService) Preview(ctx context.Context, rawToken string) (QRScanPreview, error) {
	if rawToken == "" {
		return QRScanPreview{}, domain.ErrQRTokenNotFound
	}
	preview, err := s.store.PreviewByHash(ctx, hashSessionToken(rawToken))
	if err != nil {
		return QRScanPreview{}, err
	}
	if err := validateQRToken(preview.Status, preview.ExpiresAt, s.now().UTC()); err != nil {
		return QRScanPreview{}, err
	}
	if preview.Card.StampCount >= preview.Card.RequiredStamps {
		return QRScanPreview{}, domain.ErrStampCardFull
	}
	return preview, nil
}

func (s *QRStampService) Confirm(ctx context.Context, scanID, staffID string) (StampConfirmation, error) {
	return s.store.Confirm(ctx, scanID, staffID, s.now().UTC())
}

func validateQRToken(status domain.QRStatus, expiresAt, now time.Time) error {
	switch status {
	case domain.QRStatusUsed:
		return domain.ErrQRTokenUsed
	case domain.QRStatusCancelled:
		return domain.ErrQRTokenCancelled
	case domain.QRStatusExpired:
		return domain.ErrQRTokenExpired
	case domain.QRStatusActive:
		if !expiresAt.After(now) {
			return domain.ErrQRTokenExpired
		}
		return nil
	default:
		return domain.ErrQRTokenNotFound
	}
}
