package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"gin-api/internal/domain"
)

type qrStampStoreStub struct {
	createdCustomerID string
	createdTokenHash  string
	createdExpiry     time.Time
	createdAt         time.Time
	token             domain.CustomerQRToken
	preview           QRScanPreview
	confirmResult     StampConfirmation
	confirmErr        error
	confirmedScanID   string
	confirmedStaffID  string
}

func (s *qrStampStoreStub) Create(
	_ context.Context,
	customerID,
	tokenHash string,
	expiresAt,
	now time.Time,
) (domain.CustomerQRToken, error) {
	s.createdCustomerID = customerID
	s.createdTokenHash = tokenHash
	s.createdExpiry = expiresAt
	s.createdAt = now
	return s.token, nil
}

func (s *qrStampStoreStub) GetCurrent(context.Context, string, time.Time) (domain.CustomerQRToken, error) {
	return s.token, nil
}

func (s *qrStampStoreStub) Cancel(context.Context, string, string, time.Time) error { return nil }

func (s *qrStampStoreStub) PreviewByHash(context.Context, string) (QRScanPreview, error) {
	return s.preview, nil
}

func (s *qrStampStoreStub) Confirm(
	_ context.Context,
	scanID,
	staffID string,
	_ time.Time,
) (StampConfirmation, error) {
	s.confirmedScanID = scanID
	s.confirmedStaffID = staffID
	return s.confirmResult, s.confirmErr
}

func TestGenerateCustomerQRStoresHashAndReturnsRawToken(t *testing.T) {
	fixedNow := time.Date(2026, time.September, 13, 10, 0, 0, 0, time.UTC)
	store := &qrStampStoreStub{token: domain.CustomerQRToken{ID: "qr-1", Status: domain.QRStatusActive, ExpiresAt: fixedNow.Add(time.Minute)}}
	service := NewQRStampService(store)
	service.now = func() time.Time { return fixedNow }

	result, err := service.Generate(context.Background(), "customer-1")
	if err != nil {
		t.Fatalf("Generate() returned an error: %v", err)
	}
	if result.Token == "" || result.ID != "qr-1" {
		t.Fatalf("unexpected generated QR: %+v", result)
	}
	if store.createdCustomerID != "customer-1" || store.createdTokenHash != hashSessionToken(result.Token) {
		t.Fatal("QR token was not stored as a SHA-256 hash for the authenticated customer")
	}
	if !store.createdExpiry.Equal(fixedNow.Add(CustomerQRTokenDuration)) {
		t.Fatalf("unexpected expiry: %v", store.createdExpiry)
	}
}

func TestPreviewRejectsExpiredAndUsedQR(t *testing.T) {
	fixedNow := time.Date(2026, time.September, 13, 10, 0, 0, 0, time.UTC)
	tests := []struct {
		name    string
		preview QRScanPreview
		want    error
	}{
		{name: "expired", preview: QRScanPreview{Status: domain.QRStatusActive, ExpiresAt: fixedNow}, want: domain.ErrQRTokenExpired},
		{name: "used", preview: QRScanPreview{Status: domain.QRStatusUsed, ExpiresAt: fixedNow.Add(time.Minute)}, want: domain.ErrQRTokenUsed},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := &qrStampStoreStub{preview: test.preview}
			service := NewQRStampService(store)
			service.now = func() time.Time { return fixedNow }
			_, err := service.Preview(context.Background(), "raw-token")
			if !errors.Is(err, test.want) {
				t.Fatalf("expected %v, got %v", test.want, err)
			}
		})
	}
}

func TestPreviewRejectsFullStampCard(t *testing.T) {
	fixedNow := time.Date(2026, time.September, 16, 10, 0, 0, 0, time.UTC)
	store := &qrStampStoreStub{preview: QRScanPreview{
		Status:    domain.QRStatusActive,
		ExpiresAt: fixedNow.Add(time.Minute),
		Card: domain.StampCard{
			StampCount:     10,
			RequiredStamps: 10,
		},
	}}
	service := NewQRStampService(store)
	service.now = func() time.Time { return fixedNow }

	_, err := service.Preview(context.Background(), "raw-token")
	if !errors.Is(err, domain.ErrStampCardFull) {
		t.Fatalf("expected %v, got %v", domain.ErrStampCardFull, err)
	}
}

func TestConfirmUsesAuthenticatedStaffAndScanID(t *testing.T) {
	store := &qrStampStoreStub{confirmResult: StampConfirmation{RewardAvailable: true}}
	service := NewQRStampService(store)
	result, err := service.Confirm(context.Background(), "scan-1", "staff-1")
	if err != nil {
		t.Fatalf("Confirm() returned an error: %v", err)
	}
	if store.confirmedScanID != "scan-1" || store.confirmedStaffID != "staff-1" || !result.RewardAvailable {
		t.Fatalf("unexpected confirmation: %+v", result)
	}
}
