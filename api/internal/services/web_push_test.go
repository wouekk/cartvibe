package services

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func pushUser(t *testing.T, username string) uint {
	t.Helper()
	user := models.User{Username: username, DisplayName: username, Password: "x"}
	if err := repositories.GetDB().Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	return user.ID
}

func subscriptionsOf(t *testing.T, userId uint) []models.PushSubscription {
	t.Helper()
	var subscriptions []models.PushSubscription
	repositories.GetDB().Where("user_id = ?", userId).Order("id").Find(&subscriptions)
	return subscriptions
}

func withVapidKeys(t *testing.T) {
	t.Setenv(string(constants.VapidPublicKey), "public-key")
	t.Setenv(string(constants.VapidPrivateKey), "private-key")
	t.Setenv(string(constants.VapidSubject), "")
}

func TestSavePushSubscriptionRefusesWhatTheServerCannotUse(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId := pushUser(t, "anna")

	good := "https://fcm.googleapis.com/fcm/send/abc"
	cases := map[string][3]string{
		"internal address": {"https://192.168.1.10/push", "key", "auth"},
		"plain http":       {"http://fcm.googleapis.com/fcm/send/abc", "key", "auth"},
		"no p256dh":        {good, "", "auth"},
		"no auth":          {good, "key", ""},
		"long p256dh":      {good, strings.Repeat("k", 201), "auth"},
		"long auth":        {good, "key", strings.Repeat("a", 101)},
		"long endpoint":    {good + "/" + strings.Repeat("e", 1024), "key", "auth"},
	}
	for name, values := range cases {
		if err := SavePushSubscription(userId, values[0], values[1], values[2]); !errors.Is(err, ErrInvalidPushSubscription) {
			t.Errorf("%s: expected a refusal, got %v", name, err)
		}
	}
	if len(subscriptionsOf(t, userId)) != 0 {
		t.Errorf("nothing refused is stored")
	}
}

func TestTheSameBrowserSubscribingAgainMovesToWhoeverIsSignedIn(t *testing.T) {
	defer repositories.TruncateTestDb()
	anna := pushUser(t, "anna")
	piotr := pushUser(t, "piotr")
	endpoint := "https://web.push.apple.com/device-1"

	if err := SavePushSubscription(anna, endpoint, "key-1", "auth-1"); err != nil {
		t.Fatal(err)
	}
	if err := SavePushSubscription(piotr, endpoint, "key-2", "auth-2"); err != nil {
		t.Fatal(err)
	}

	if len(subscriptionsOf(t, anna)) != 0 {
		t.Errorf("the browser no longer rings for the person who signed out")
	}
	moved := subscriptionsOf(t, piotr)
	if len(moved) != 1 || moved[0].P256dh != "key-2" || moved[0].Auth != "auth-2" {
		t.Errorf("one subscription with the new keys, got %+v", moved)
	}

	if err := DeletePushSubscription(anna, endpoint); err != nil || len(subscriptionsOf(t, piotr)) != 1 {
		t.Errorf("a person can only remove their own browser: %v", err)
	}
	if err := DeletePushSubscription(piotr, endpoint); err != nil || len(subscriptionsOf(t, piotr)) != 0 {
		t.Errorf("removing one's own browser: %v", err)
	}
}

func TestWebPushPublicKeyNeedsBothKeys(t *testing.T) {
	t.Setenv(string(constants.VapidPublicKey), "public-key")
	t.Setenv(string(constants.VapidPrivateKey), "")
	if WebPushPublicKey() != "" {
		t.Errorf("without a private key the browser must not be offered push")
	}
	t.Setenv(string(constants.VapidPrivateKey), "private-key")
	if WebPushPublicKey() != "public-key" {
		t.Errorf("with both keys the public one is offered")
	}
}

func TestSendWebPushRingsEveryBrowserAndForgetsTheGoneOnes(t *testing.T) {
	defer repositories.TruncateTestDb()
	withVapidKeys(t)
	userId := pushUser(t, "anna")
	other := pushUser(t, "piotr")

	gone := "https://fcm.googleapis.com/fcm/send/gone"
	failing := "https://updates.push.services.mozilla.com/wpush/v2/failing"
	working := "https://web.push.apple.com/working"
	for _, endpoint := range []string{gone, failing, working} {
		if err := SavePushSubscription(userId, endpoint, "key", "auth"); err != nil {
			t.Fatal(err)
		}
	}
	// A row stored before the endpoint rules existed is dropped, never posted to.
	repositories.GetDB().Create(&models.PushSubscription{UserId: userId, Endpoint: "https://169.254.169.254/meta", P256dh: "k", Auth: "a"})
	SavePushSubscription(other, "https://fcm.googleapis.com/fcm/send/someone-else", "key", "auth")

	sentTo := []string{}
	var payload map[string]any
	var options *webpush.Options
	restore := SetWebPushSenderForTests(func(body []byte, subscription *webpush.Subscription, sendOptions *webpush.Options) (int, error) {
		sentTo = append(sentTo, subscription.Endpoint)
		json.Unmarshal(body, &payload)
		options = sendOptions
		switch subscription.Endpoint {
		case gone:
			return 410, nil
		case failing:
			return 500, nil
		}
		return 201, nil
	})
	defer restore()

	SendWebPushQuietly(userId, WebPushMessage{Title: "Warranty ends today", Body: "Kettle", Url: "/receipts/7/view", Tag: "warranty-7"})

	if len(sentTo) != 3 {
		t.Fatalf("each of the person's valid browsers is rung once, sent to %v", sentTo)
	}
	for _, endpoint := range sentTo {
		if strings.Contains(endpoint, "someone-else") || strings.Contains(endpoint, "169.254") {
			t.Errorf("posted to %s", endpoint)
		}
	}

	left := map[string]bool{}
	for _, subscription := range subscriptionsOf(t, userId) {
		left[subscription.Endpoint] = true
	}
	if left[gone] || !left[failing] || !left[working] || len(left) != 2 {
		t.Errorf("a 410 and an unusable endpoint are forgotten, a 500 is kept: %v", left)
	}

	notification, _ := payload["notification"].(map[string]any)
	if notification["title"] != "Warranty ends today" || notification["tag"] != "warranty-7" {
		t.Errorf("payload: %v", payload)
	}
	action, _ := notification["data"].(map[string]any)["onActionClick"].(map[string]any)["default"].(map[string]any)
	if action["url"] != "/receipts/7/view" || action["operation"] != "navigateLastFocusedOrOpen" {
		t.Errorf("a tap opens the page: %v", action)
	}
	if options.Subscriber != "mailto:admin@localhost" || options.Topic != "warranty-7" || options.VAPIDPrivateKey != "private-key" {
		t.Errorf("options: %+v", options)
	}
}

func TestSendWebPushWithoutKeysTouchesNothing(t *testing.T) {
	defer repositories.TruncateTestDb()
	t.Setenv(string(constants.VapidPublicKey), "")
	t.Setenv(string(constants.VapidPrivateKey), "")
	userId := pushUser(t, "anna")
	SavePushSubscription(userId, "https://fcm.googleapis.com/fcm/send/abc", "key", "auth")

	calls := 0
	restore := SetWebPushSenderForTests(func([]byte, *webpush.Subscription, *webpush.Options) (int, error) {
		calls++
		return 410, nil
	})
	defer restore()

	SendWebPushQuietly(userId, WebPushMessage{Title: "x"})
	if calls != 0 || len(subscriptionsOf(t, userId)) != 1 {
		t.Errorf("no keys means no call and no cleanup: %d calls", calls)
	}
}
