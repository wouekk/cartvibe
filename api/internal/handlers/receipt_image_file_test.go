package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
)

// seedReceiptImage creates a household with a receipt and one image row, and returns the image's id.
func seedReceiptImage(t *testing.T) uint {
	t.Helper()
	repositories.CreateTestGroupWithUsers()
	fileData := models.FileData{Name: "receipt.jpg", ReceiptId: seedReceipt(t, 1, 1), FileType: "image/jpeg"}
	if err := repositories.GetDB().Create(&fileData).Error; err != nil {
		t.Fatalf("seed image: %v", err)
	}
	return fileData.ID
}

func imageRequest(method string, userId uint, imageId string, query string) (*httptest.ResponseRecorder, *http.Request) {
	w, r := shoppingListRequest(method, "", userId, map[string]string{"id": imageId})
	r.URL.RawQuery = query
	return w, r
}

// S18: an id that is not there used to answer 500 before anyone was asked who they are, which told a caller which
// ids exist. It now answers exactly what a refusal answers.
func TestAnUnknownImageAnswersLikeARefusedOne(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	for name, handle := range map[string]http.HandlerFunc{
		"read":     GetReceiptImage,
		"download": DownloadReceiptImage,
		"file":     GetReceiptImageFile,
		"remove":   RemoveReceiptImage,
	} {
		w, r := imageRequest("GET", 1, "424242", "")
		handle(w, r)

		if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), unauthorizedEntityMessage) {
			t.Errorf("%s: expected the 403 of a refusal, got %d %s", name, w.Code, w.Body.String())
		}
	}
}

func TestTheImageFileIsForThoseWhoMayReadTheReceipt(t *testing.T) {
	defer repositories.TruncateTestDb()
	imageId := utils.UintToString(seedReceiptImage(t))
	grantGroupPerms(t, 2, 1)

	w, r := imageRequest("GET", 2, imageId, "")
	GetReceiptImageFile(w, r)

	if w.Code != http.StatusForbidden {
		t.Errorf("a member without group.receipts.read is refused, got %d", w.Code)
	}
	if w.Header().Get("Cache-Control") != "" {
		t.Errorf("a refusal must not be cached, got Cache-Control %q", w.Header().Get("Cache-Control"))
	}
}

// A browser that already has the image is told so, without the file being read (or made).
func TestTheImageFileAnswers304ToABrowserThatHasIt(t *testing.T) {
	defer repositories.TruncateTestDb()
	imageId := utils.UintToString(seedReceiptImage(t))
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead)

	for query, etag := range map[string]string{
		"":        `"` + imageId + `-display"`,
		"w=thumb": `"` + imageId + `-thumb"`,
	} {
		w, r := imageRequest("GET", 1, imageId, query)
		r.Header.Set("If-None-Match", etag)
		GetReceiptImageFile(w, r)

		if w.Code != http.StatusNotModified {
			t.Errorf("%q: expected 304, got %d %s", query, w.Code, w.Body.String())
		}
		if w.Header().Get("ETag") != etag {
			t.Errorf("%q: the ETag names the image and the size, got %q", query, w.Header().Get("ETag"))
		}
		if cache := w.Header().Get("Cache-Control"); !strings.Contains(cache, "private") || !strings.Contains(cache, "immutable") {
			t.Errorf("%q: an image never changes under its id, so it is cached for good and only by the browser, got %q", query, cache)
		}
	}
}

func TestTheImageFileRefusesASizeItDoesNotKeep(t *testing.T) {
	defer repositories.TruncateTestDb()
	imageId := utils.UintToString(seedReceiptImage(t))
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead)

	w, r := imageRequest("GET", 1, imageId, "w=../../original")
	GetReceiptImageFile(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("only display and thumb are kept, got %d %s", w.Code, w.Body.String())
	}
}
