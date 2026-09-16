package http_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	httpdelivery "gin-api/internal/delivery/http"
	"gin-api/internal/domain"
	"gin-api/internal/service"
)

type qrStampApplicationStub struct {
	generated       service.GeneratedCustomerQR
	preview         service.QRScanPreview
	confirmation    service.StampConfirmation
	previewErr      error
	confirmErr      error
	confirmedScanID string
	confirmedStaff  string
}

func (s *qrStampApplicationStub) Generate(context.Context, string) (service.GeneratedCustomerQR, error) {
	return s.generated, nil
}

func (s *qrStampApplicationStub) GetCurrent(context.Context, string) (domain.CustomerQRToken, error) {
	return domain.CustomerQRToken{}, nil
}

func (s *qrStampApplicationStub) Cancel(context.Context, string, string) error { return nil }

func (s *qrStampApplicationStub) Preview(context.Context, string) (service.QRScanPreview, error) {
	return s.preview, s.previewErr
}

func (s *qrStampApplicationStub) Confirm(
	_ context.Context,
	scanID,
	staffID string,
) (service.StampConfirmation, error) {
	s.confirmedScanID = scanID
	s.confirmedStaff = staffID
	return s.confirmation, s.confirmErr
}

func newQRRouter(qr *qrStampApplicationStub) http.Handler {
	return httpdelivery.NewRouter(httpdelivery.RouterDependencies{
		HealthChecker:          healthChecker{},
		QRStampService:         qr,
		CustomerSessionService: &sessionApplicationStub{authenticatedID: "customer-1"},
		StaffService:           &staffApplicationStub{authenticatedID: "staff-1"},
	})
}

func TestCustomerGeneratesQRWithAuthenticatedIdentity(t *testing.T) {
	qr := &qrStampApplicationStub{generated: service.GeneratedCustomerQR{ID: "qr-1", Token: "raw-qr-token", Status: domain.QRStatusActive}}
	request := httptest.NewRequest(http.MethodPost, "/api/customers/me/qr-tokens", nil)
	request.AddCookie(&http.Cookie{Name: "customer_session", Value: "customer-cookie"})
	response := httptest.NewRecorder()
	newQRRouter(qr).ServeHTTP(response, request)

	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), "raw-qr-token") {
		t.Fatalf("unexpected generate response response: %d %s", response.Code, response.Body.String())
	}
}

func TestStaffPreviewRequiresToken(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/staff/stamp-scans/preview", bytes.NewBufferString(`{}`))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: "staff_session", Value: "staff-cookie"})
	response := httptest.NewRecorder()
	newQRRouter(&qrStampApplicationStub{}).ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "INVALID_REQUEST") {
		t.Fatalf("unexpected preview response: %d %s", response.Code, response.Body.String())
	}
}

func TestStaffConfirmationUsesAuthenticatedStaff(t *testing.T) {
	qr := &qrStampApplicationStub{confirmation: service.StampConfirmation{RewardAvailable: true}}
	request := httptest.NewRequest(http.MethodPost, "/api/staff/stamp-scans/scan-1/confirm", nil)
	request.AddCookie(&http.Cookie{Name: "staff_session", Value: "staff-cookie"})
	response := httptest.NewRecorder()
	newQRRouter(qr).ServeHTTP(response, request)

	if response.Code != http.StatusOK || qr.confirmedScanID != "scan-1" || qr.confirmedStaff != "staff-1" {
		t.Fatalf("unexpected confirmation: %d %s, scan=%q staff=%q", response.Code, response.Body.String(), qr.confirmedScanID, qr.confirmedStaff)
	}
}

func TestExpiredQRMapsToGone(t *testing.T) {
	qr := &qrStampApplicationStub{previewErr: domain.ErrQRTokenExpired}
	request := httptest.NewRequest(http.MethodPost, "/api/staff/stamp-scans/preview", bytes.NewBufferString(`{"token":"raw-token"}`))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: "staff_session", Value: "staff-cookie"})
	response := httptest.NewRecorder()
	newQRRouter(qr).ServeHTTP(response, request)

	if response.Code != http.StatusGone || !strings.Contains(response.Body.String(), "QR_TOKEN_EXPIRED") {
		t.Fatalf("unexpected expired response: %d %s", response.Code, response.Body.String())
	}
}

func TestFullStampCardMapsToConflict(t *testing.T) {
	qr := &qrStampApplicationStub{confirmErr: domain.ErrStampCardFull}
	request := httptest.NewRequest(http.MethodPost, "/api/staff/stamp-scans/scan-1/confirm", nil)
	request.AddCookie(&http.Cookie{Name: "staff_session", Value: "staff-cookie"})
	response := httptest.NewRecorder()
	newQRRouter(qr).ServeHTTP(response, request)

	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "STAMP_CARD_FULL") {
		t.Fatalf("unexpected full card response: %d %s", response.Code, response.Body.String())
	}
}
