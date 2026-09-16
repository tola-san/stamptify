package domain

import "errors"

var (
	ErrCustomerNotFound    = errors.New("customer not found")
	ErrPhoneAlreadyExists  = errors.New("phone number is already registered")
	ErrInvalidName         = errors.New("name must contain between 2 and 100 characters")
	ErrInvalidPhone        = errors.New("phone number must use international format")
	ErrInvalidSession      = errors.New("customer session is invalid")
	ErrStaffNotFound       = errors.New("staff account not found")
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrInvalidStaffSession = errors.New("staff session is invalid")
	ErrInvalidCursor       = errors.New("transaction cursor is invalid")
	ErrInvalidPageLimit    = errors.New("transaction limit must be between 1 and 100")
	ErrQRTokenNotFound     = errors.New("customer QR token not found")
	ErrQRTokenExpired      = errors.New("customer QR token has expired")
	ErrQRTokenUsed         = errors.New("customer QR token has already been used")
	ErrQRTokenCancelled    = errors.New("customer QR token has been cancelled")
	ErrStampCardNotFound   = errors.New("stamp card not found")
	ErrStampCardFull       = errors.New("stamp card has reached its required stamps")
)
