package http

import (
	"context"
	"errors"
	"net/http"

	"gin-api/internal/domain"
	"gin-api/internal/service"

	"github.com/gin-gonic/gin"
)

type QRStampApplication interface {
	Generate(context.Context, string) (service.GeneratedCustomerQR, error)
	GetCurrent(context.Context, string) (domain.CustomerQRToken, error)
	Cancel(context.Context, string, string) error
	Preview(context.Context, string) (service.QRScanPreview, error)
	Confirm(context.Context, string, string) (service.StampConfirmation, error)
}

type qrStampHandler struct {
	qr QRStampApplication
}

type previewQRRequest struct {
	Token string `json:"token" binding:"required"`
}

func newQRStampHandler(qr QRStampApplication) *qrStampHandler {
	return &qrStampHandler{qr: qr}
}

func (h *qrStampHandler) generate(c *gin.Context) {
	result, err := h.qr.Generate(c.Request.Context(), c.GetString(customerIDContextKey))
	if err != nil {
		writeQRStampError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": result})
}

func (h *qrStampHandler) current(c *gin.Context) {
	token, err := h.qr.GetCurrent(c.Request.Context(), c.GetString(customerIDContextKey))
	if err != nil {
		writeQRStampError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": token})
}

func (h *qrStampHandler) cancel(c *gin.Context) {
	if err := h.qr.Cancel(c.Request.Context(), c.GetString(customerIDContextKey), c.Param("tokenId")); err != nil {
		writeQRStampError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *qrStampHandler) preview(c *gin.Context) {
	var request previewQRRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "token is required")
		return
	}
	preview, err := h.qr.Preview(c.Request.Context(), request.Token)
	if err != nil {
		writeQRStampError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": preview})
}

func (h *qrStampHandler) confirm(c *gin.Context) {
	result, err := h.qr.Confirm(
		c.Request.Context(),
		c.Param("scanId"),
		c.GetString(staffIDContextKey),
	)
	if err != nil {
		writeQRStampError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func writeQRStampError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrQRTokenNotFound):
		writeError(c, http.StatusNotFound, "QR_TOKEN_NOT_FOUND", err.Error())
	case errors.Is(err, domain.ErrQRTokenExpired):
		writeError(c, http.StatusGone, "QR_TOKEN_EXPIRED", err.Error())
	case errors.Is(err, domain.ErrQRTokenUsed):
		writeError(c, http.StatusConflict, "QR_TOKEN_ALREADY_USED", err.Error())
	case errors.Is(err, domain.ErrQRTokenCancelled):
		writeError(c, http.StatusConflict, "QR_TOKEN_CANCELLED", err.Error())
	case errors.Is(err, domain.ErrStampCardNotFound):
		writeError(c, http.StatusUnprocessableEntity, "STAMP_CARD_NOT_FOUND", err.Error())
	case errors.Is(err, domain.ErrStampCardFull):
		writeError(c, http.StatusConflict, "STAMP_CARD_FULL", err.Error())
	default:
		_ = c.Error(err)
		writeError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "an internal error occurred")
	}
}
