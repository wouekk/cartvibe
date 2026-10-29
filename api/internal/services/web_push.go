package services

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	webpush "github.com/SherClockHolmes/webpush-go"
	"gorm.io/gorm/clause"
)

// pushServiceHosts are the push services a browser subscription may point at (Chrome and Edge through FCM,
// Firefox, Safari, legacy Edge). The server posts to the subscription's URL, which the browser chose, so anything
// else is refused: a subscription must not make the server call an arbitrary or internal address.
var pushServiceHosts = []string{
	"fcm.googleapis.com",
	"android.googleapis.com",
	"updates.push.services.mozilla.com",
	".push.apple.com",
	".notify.windows.com",
}

// ErrInvalidPushSubscription is a subscription that is not an https URL of a known push service, or lacks its keys.
var ErrInvalidPushSubscription = errors.New("this is not a push subscription the server can use")

// WebPushMessage is what a notification on the device shows. Url is the page a tap opens.
type WebPushMessage struct {
	Title string
	Body  string
	Url   string
	// Tag lets the device replace an earlier notification of the same thing instead of stacking a second.
	Tag string
}

// WebPushPublicKey is the VAPID public key a browser subscribes with; "" when push is not set up.
func WebPushPublicKey() string {
	if os.Getenv(string(constants.VapidPrivateKey)) == "" {
		return ""
	}
	return os.Getenv(string(constants.VapidPublicKey))
}

// ValidatePushEndpoint accepts only an https URL on a known push service.
func ValidatePushEndpoint(endpoint string) error {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Port() != "" {
		return ErrInvalidPushSubscription
	}
	host := strings.ToLower(parsed.Hostname())
	for _, allowed := range pushServiceHosts {
		if host == allowed || (strings.HasPrefix(allowed, ".") && strings.HasSuffix(host, allowed)) {
			return nil
		}
	}
	return ErrInvalidPushSubscription
}

// SavePushSubscription stores a browser's subscription for the person. The same browser subscribing again (same
// endpoint) replaces its keys, and moves to whoever is signed in now.
func SavePushSubscription(userId uint, endpoint string, p256dh string, auth string) error {
	if err := ValidatePushEndpoint(endpoint); err != nil {
		return err
	}
	if p256dh == "" || auth == "" || len(p256dh) > 200 || len(auth) > 100 || len(endpoint) > 1024 {
		return ErrInvalidPushSubscription
	}

	subscription := models.PushSubscription{UserId: userId, Endpoint: endpoint, P256dh: p256dh, Auth: auth}
	return repositories.GetDB().Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "endpoint"}},
		DoUpdates: clause.AssignmentColumns([]string{"user_id", "p256dh", "auth", "updated_at"}),
	}).Create(&subscription).Error
}

// DeletePushSubscription removes one of the person's browsers (they switched push off, or signed out).
func DeletePushSubscription(userId uint, endpoint string) error {
	return repositories.GetDB().Where("user_id = ? AND endpoint = ?", userId, endpoint).Delete(&models.PushSubscription{}).Error
}

// webPushSend is the network call, a variable so tests can stand in for the push service.
var webPushSend = func(payload []byte, subscription *webpush.Subscription, options *webpush.Options) (int, error) {
	response, err := webpush.SendNotification(payload, subscription, options)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	return response.StatusCode, nil
}

// SetWebPushSenderForTests swaps the push call and returns a function restoring it. Tests only.
func SetWebPushSenderForTests(send func(payload []byte, subscription *webpush.Subscription, options *webpush.Options) (int, error)) func() {
	previous := webPushSend
	webPushSend = send
	return func() { webPushSend = previous }
}

// SendWebPushQuietly sends the message to every browser the person subscribed. It is best-effort: without VAPID
// keys it does nothing, a failure is logged, and a subscription the push service says is gone (404 or 410) is
// deleted. The in-app notification is the record; push only rings the device.
func SendWebPushQuietly(userId uint, message WebPushMessage) {
	publicKey := WebPushPublicKey()
	privateKey := os.Getenv(string(constants.VapidPrivateKey))
	if publicKey == "" || privateKey == "" {
		return
	}

	var subscriptions []models.PushSubscription
	if err := repositories.GetDB().Where("user_id = ?", userId).Find(&subscriptions).Error; err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "web push: "+err.Error())
		return
	}
	if len(subscriptions) == 0 {
		return
	}

	payload, err := webPushPayload(message)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "web push: "+err.Error())
		return
	}

	subject := os.Getenv(string(constants.VapidSubject))
	if subject == "" {
		subject = "mailto:admin@localhost"
	}

	for _, subscription := range subscriptions {
		if ValidatePushEndpoint(subscription.Endpoint) != nil {
			repositories.GetDB().Delete(&models.PushSubscription{}, subscription.ID)
			continue
		}

		status, err := webPushSend(payload, &webpush.Subscription{
			Endpoint: subscription.Endpoint,
			Keys:     webpush.Keys{P256dh: subscription.P256dh, Auth: subscription.Auth},
		}, &webpush.Options{
			Subscriber:      subject,
			VAPIDPublicKey:  publicKey,
			VAPIDPrivateKey: privateKey,
			TTL:             int((24 * time.Hour).Seconds()),
			Urgency:         webpush.UrgencyNormal,
			Topic:           message.Tag,
		})
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "web push: "+err.Error())
			continue
		}
		if status == http.StatusNotFound || status == http.StatusGone {
			repositories.GetDB().Delete(&models.PushSubscription{}, subscription.ID)
		} else if status >= 400 {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "web push: the push service answered", http.StatusText(status))
		}
	}
}

// webPushPayload is the message in the shape the Angular service worker shows on its own: a notification object,
// and the page a tap opens (navigateLastFocusedOrOpen focuses an open app window or opens one).
func webPushPayload(message WebPushMessage) ([]byte, error) {
	return json.Marshal(map[string]any{
		"notification": map[string]any{
			"title": message.Title,
			"body":  message.Body,
			"icon":  "/assets/brand/pwa/icon-192.png",
			"tag":   message.Tag,
			"data": map[string]any{
				"onActionClick": map[string]any{
					"default": map[string]any{"operation": "navigateLastFocusedOrOpen", "url": message.Url},
				},
			},
		},
	})
}
