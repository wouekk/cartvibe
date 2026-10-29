package services

import (
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/shopspring/decimal"
)

// warrantyNow is 10:00 UTC (the test app zone), after the 09:00 send time.
var warrantyNow = time.Date(2026, 10, 29, 10, 0, 0, 0, time.UTC)

func seedWarrantyReceipt(t *testing.T, groupId uint, paidBy uint, warrantyUntil *string) uint {
	t.Helper()
	receipt := models.Receipt{
		Name:          "Toaster",
		ShopName:      "MediaMarkt",
		Amount:        decimal.NewFromInt(49),
		Date:          time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
		PaidByUserID:  paidBy,
		GroupId:       groupId,
		Status:        models.OPEN,
		WarrantyUntil: warrantyUntil,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	return receipt.ID
}

func warrantyRemindersFor(t *testing.T, receiptId uint) map[uint]models.WarrantyReminder {
	t.Helper()
	var reminders []models.WarrantyReminder
	if err := repositories.GetDB().Where("receipt_id = ?", receiptId).Find(&reminders).Error; err != nil {
		t.Fatal(err)
	}
	byUser := map[uint]models.WarrantyReminder{}
	for _, reminder := range reminders {
		byUser[reminder.UserId] = reminder
	}
	return byUser
}

func setLeadDays(t *testing.T, userId uint, days int) {
	t.Helper()
	repository := repositories.NewUserPreferencesRepository(nil)
	if _, err := repository.GetUserPreferencesOrCreate(userId); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.UpdateUserPreferences(userId, models.UserPrefernces{WarrantyReminderLeadDays: &days}); err != nil {
		t.Fatal(err)
	}
}

func warrantyDay(s string) *string { return &s }

// Everyone who can read the receipt gets one reminder at their own lead time; a member who cannot see it (member
// isolation hides the payer) gets none.
func TestSyncWarrantyRemindersPlansOnePerVisibleMember(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()
	fx := seedIsolatedReceiptGroup(t)
	setLeadDays(t, fx.supervisorId, 0)

	receiptId := seedWarrantyReceipt(t, fx.groupId, fx.memberBId, warrantyDay("2027-03-12"))
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}

	reminders := warrantyRemindersFor(t, receiptId)
	if _, ok := reminders[fx.memberAId]; ok {
		t.Errorf("member A cannot see B's receipt and must not be reminded")
	}
	if got := reminders[fx.memberBId].FireOn; got != "2027-02-10" {
		t.Errorf("B (default 30 days) should be reminded on 2027-02-10, got %q", got)
	}
	if got := reminders[fx.supervisorId].FireOn; got != "2027-03-12" {
		t.Errorf("the supervisor (0 days) should be reminded on the day, got %q", got)
	}
	if reminders[fx.memberBId].Key != WarrantyReminderKey(receiptId) {
		t.Errorf("unexpected key %q", reminders[fx.memberBId].Key)
	}

	// Planning again replaces, never adds a second reminder.
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}
	var count int64
	repositories.GetDB().Model(&models.WarrantyReminder{}).Where("receipt_id = ?", receiptId).Count(&count)
	if count != 2 {
		t.Errorf("expected 2 reminders after planning twice, got %d", count)
	}
}

// Changing the lead time moves the person's pending reminders.
func TestSyncWarrantyRemindersForUserFollowsTheLeadTime(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()
	fx := seedIsolatedReceiptGroup(t)

	receiptId := seedWarrantyReceipt(t, fx.groupId, fx.memberBId, warrantyDay("2027-03-12"))
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}

	setLeadDays(t, fx.memberBId, 7)
	if err := SyncWarrantyRemindersForUser(fx.memberBId, warrantyNow); err != nil {
		t.Fatal(err)
	}
	if got := warrantyRemindersFor(t, receiptId)[fx.memberBId].FireOn; got != "2027-03-05" {
		t.Errorf("a 7-day lead should move the reminder to 2027-03-05, got %q", got)
	}
}

// Clearing the date, a date in the past and deleting the receipt all cancel its reminders.
func TestWarrantyRemindersAreCancelled(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()
	fx := seedIsolatedReceiptGroup(t)

	receiptId := seedWarrantyReceipt(t, fx.groupId, fx.memberBId, warrantyDay("2027-03-12"))
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}

	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receiptId).Update("warranty_until", nil)
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}
	if len(warrantyRemindersFor(t, receiptId)) != 0 {
		t.Errorf("a cleared date should leave no reminders")
	}

	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receiptId).Update("warranty_until", "2026-10-28")
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}
	if len(warrantyRemindersFor(t, receiptId)) != 0 {
		t.Errorf("a warranty that already ended gets no reminder")
	}

	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receiptId).Update("warranty_until", "2027-03-12")
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}
	if err := NewReceiptService(nil).DeleteReceipt(utils.UintToString(receiptId)); err != nil {
		t.Fatal(err)
	}
	if len(warrantyRemindersFor(t, receiptId)) != 0 {
		t.Errorf("deleting the receipt should cancel its reminders")
	}
}

// A reminder fires once on its day after 09:00, never again for the same date (a rerun or a re-save keeps it read),
// and again for a new date. It never shows the amount.
func TestFireDueWarrantyRemindersFiresOncePerDate(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()
	fx := seedIsolatedReceiptGroup(t)
	setLeadDays(t, fx.supervisorId, 0)

	var pushed int
	restore := SetWebPushSenderForTests(func([]byte, *webpush.Subscription, *webpush.Options) (int, error) {
		pushed++
		return 201, nil
	})
	defer restore()

	// Ends in 10 days: B's 30-day lead is already past, so B is reminded today; the supervisor on the day.
	receiptId := seedWarrantyReceipt(t, fx.groupId, fx.memberBId, warrantyDay("2026-11-08"))
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}

	early := time.Date(2026, 10, 29, 8, 59, 0, 0, time.UTC)
	if sent, err := FireDueWarrantyReminders(early); err != nil || sent != 0 {
		t.Fatalf("nothing goes out before 09:00, sent %d (%v)", sent, err)
	}

	sent, err := FireDueWarrantyReminders(warrantyNow)
	if err != nil || sent != 1 {
		t.Fatalf("expected B's reminder only, sent %d (%v)", sent, err)
	}

	var notifications []models.Notification
	repositories.GetDB().Where("user_id = ?", fx.memberBId).Find(&notifications)
	if len(notifications) != 1 {
		t.Fatalf("expected one notification for B, got %d", len(notifications))
	}
	if notifications[0].Title != "Warranty ends 8 November" {
		t.Errorf("unexpected title %q", notifications[0].Title)
	}
	if notifications[0].Body == "" || strings.Contains(notifications[0].Body, "49") {
		t.Errorf("the body should name the shop and never the amount: %q", notifications[0].Body)
	}

	// A rerun and a re-save of the same date add nothing.
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}
	if sent, _ := FireDueWarrantyReminders(warrantyNow.Add(time.Hour)); sent != 0 {
		t.Errorf("the same date must not fire twice, sent %d", sent)
	}

	// A new date fires again.
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receiptId).Update("warranty_until", "2026-11-09")
	if err := SyncWarrantyReminders(receiptId, warrantyNow); err != nil {
		t.Fatal(err)
	}
	if sent, _ := FireDueWarrantyReminders(warrantyNow.Add(2 * time.Hour)); sent != 1 {
		t.Errorf("a new date should fire again, sent %d", sent)
	}

	// The supervisor's comes on the day, titled "today".
	onTheDay := time.Date(2026, 11, 9, 9, 30, 0, 0, time.UTC)
	if sent, _ := FireDueWarrantyReminders(onTheDay); sent != 1 {
		t.Errorf("expected the supervisor's reminder on the day, sent %d", sent)
	}
	var supervisorNotification models.Notification
	repositories.GetDB().Where("user_id = ?", fx.supervisorId).Take(&supervisorNotification)
	if supervisorNotification.Title != "Warranty ends today" {
		t.Errorf("unexpected title %q", supervisorNotification.Title)
	}

	if pushed != 0 {
		t.Errorf("without VAPID keys nothing is pushed, got %d", pushed)
	}
}

func TestValidatePushEndpoint(t *testing.T) {
	for endpoint, ok := range map[string]bool{
		"https://fcm.googleapis.com/fcm/send/abc":            true,
		"https://updates.push.services.mozilla.com/wpush/v2": true,
		"https://web.push.apple.com/QGuQyavXut":              true,
		"https://db5p.notify.windows.com/w/?token=x":         true,
		"http://fcm.googleapis.com/fcm/send/abc":             false,
		"https://169.254.169.254/latest/meta-data":           false,
		"https://localhost/push":                             false,
		"https://evilpush.apple.com.example.com/x":           false,
		"https://fcm.googleapis.com:8443/x":                  false,
		"https://user@fcm.googleapis.com/x":                  false,
	} {
		if got := ValidatePushEndpoint(endpoint) == nil; got != ok {
			t.Errorf("%s: expected allowed=%v", endpoint, ok)
		}
	}
}

// The Warranties list and tile count warranties that end today or later, and only receipts the viewer can see.
func TestActiveWarrantiesCountFromTodayOn(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()
	fx := seedIsolatedReceiptGroup(t)

	today := time.Now().UTC()
	seedWarrantyReceipt(t, fx.groupId, fx.memberBId, warrantyDay(today.AddDate(0, 0, -1).Format(time.DateOnly)))
	seedWarrantyReceipt(t, fx.groupId, fx.memberBId, warrantyDay(today.Format(time.DateOnly)))
	seedWarrantyReceipt(t, fx.groupId, fx.memberBId, warrantyDay(today.AddDate(1, 0, 0).Format(time.DateOnly)))
	seedWarrantyReceipt(t, fx.groupId, fx.memberBId, nil)

	count, err := NewGroupOverviewService(nil).countActiveWarranties(fx.memberBId, utils.UintToString(fx.groupId))
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Errorf("expected today's and next year's warranty, got %d", count)
	}

	hidden, err := NewGroupOverviewService(nil).countActiveWarranties(fx.memberAId, utils.UintToString(fx.groupId))
	if err != nil {
		t.Fatal(err)
	}
	if hidden != 0 {
		t.Errorf("member A cannot see B's receipts, so counts none, got %d", hidden)
	}
}
