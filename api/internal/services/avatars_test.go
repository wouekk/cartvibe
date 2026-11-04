package services

import (
	"bytes"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"errors"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func testPngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(1, 1, color.RGBA{R: 255, A: 255})
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func cleanAvatar(t *testing.T, userId uint) {
	t.Cleanup(func() { _ = RemoveUserAvatarFile(userId) })
}

func storedAvatarUpdatedAt(t *testing.T, userId uint) *models.User {
	t.Helper()
	var user models.User
	if err := repositories.GetDB().First(&user, userId).Error; err != nil {
		t.Fatal(err)
	}
	return &user
}

func TestSaveUserAvatar_StoresThePhotoAndServesItBack(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearRolePermissionCacheAll()
	owner := seedIsoUser(t, "avatar-owner")
	cleanAvatar(t, owner.ID)
	photo := testPngBytes(t)

	savedAt, err := SaveUserAvatar(owner.ID, photo)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if user := storedAvatarUpdatedAt(t, owner.ID); user.AvatarUpdatedAt == nil || !user.AvatarUpdatedAt.Equal(savedAt) {
		t.Fatalf("avatar_updated_at = %v, want %v", user.AvatarUpdatedAt, savedAt)
	}

	path, _ := utils.BuildAvatarPathString(owner.ID)
	if exists, _ := utils.DataPathExists(path); !exists {
		t.Fatalf("the photo is not under data/avatars/")
	}

	data, contentType, err := ReadUserAvatar(owner.ID, owner.ID)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if contentType != "image/png" || !bytes.Equal(data, photo) {
		t.Fatalf("read back %s, %d bytes", contentType, len(data))
	}
}

func TestSaveUserAvatar_RefusesOtherFormatsAndLargeFiles(t *testing.T) {
	defer repositories.TruncateTestDb()
	owner := seedIsoUser(t, "avatar-refused")
	cleanAvatar(t, owner.ID)

	for name, data := range map[string][]byte{
		"text": []byte("hello, not a photo"),
		"svg":  []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
	} {
		if _, err := SaveUserAvatar(owner.ID, data); !errors.Is(err, ErrAvatarType) {
			t.Errorf("%s: err = %v, want ErrAvatarType", name, err)
		}
	}

	large := append(testPngBytes(t), make([]byte, MaxAvatarBytes)...)
	if _, err := SaveUserAvatar(owner.ID, large); !errors.Is(err, ErrAvatarTooLarge) {
		t.Errorf("large: err = %v, want ErrAvatarTooLarge", err)
	}

	if user := storedAvatarUpdatedAt(t, owner.ID); user.AvatarUpdatedAt != nil {
		t.Fatalf("a refused upload set avatar_updated_at")
	}
}

func TestReadUserAvatar_HidesAnIsolatedPeersPhoto(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearRolePermissionCacheAll()

	group := seedIsoGroup(t, "avatar-iso", true)
	supRole := seedIsoRole(t, "avatar-supervisor", true)
	memberRole := seedIsoRole(t, "avatar-member", false)
	coord := seedIsoUser(t, "avatar-coord")
	p1 := seedIsoUser(t, "avatar-p1")
	p2 := seedIsoUser(t, "avatar-p2")
	seedIsoMember(t, group.ID, coord.ID, &supRole.ID)
	seedIsoMember(t, group.ID, p1.ID, &memberRole.ID)
	seedIsoMember(t, group.ID, p2.ID, &memberRole.ID)
	cleanAvatar(t, p2.ID)
	cleanAvatar(t, coord.ID)

	if _, err := SaveUserAvatar(p2.ID, testPngBytes(t)); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveUserAvatar(coord.ID, testPngBytes(t)); err != nil {
		t.Fatal(err)
	}

	if _, _, err := ReadUserAvatar(p1.ID, p2.ID); !errors.Is(err, ErrAvatarNotFound) {
		t.Fatalf("an isolated peer's photo: err = %v, want ErrAvatarNotFound", err)
	}
	if _, _, err := ReadUserAvatar(p1.ID, coord.ID); err != nil {
		t.Fatalf("the supervisor's photo: %v", err)
	}
	if _, _, err := ReadUserAvatar(coord.ID, p2.ID); err != nil {
		t.Fatalf("the supervisor reading a member's photo: %v", err)
	}
}

func TestRemoveUserAvatar_ShowsTheInitialsAgain(t *testing.T) {
	defer repositories.TruncateTestDb()
	owner := seedIsoUser(t, "avatar-removed")
	cleanAvatar(t, owner.ID)

	if _, err := SaveUserAvatar(owner.ID, testPngBytes(t)); err != nil {
		t.Fatal(err)
	}
	if err := RemoveUserAvatar(owner.ID); err != nil {
		t.Fatalf("remove: %v", err)
	}

	if user := storedAvatarUpdatedAt(t, owner.ID); user.AvatarUpdatedAt != nil {
		t.Fatalf("avatar_updated_at kept after removal")
	}
	if _, _, err := ReadUserAvatar(owner.ID, owner.ID); !errors.Is(err, ErrAvatarNotFound) {
		t.Fatalf("read after removal: err = %v", err)
	}
	// Removing again is not an error.
	if err := RemoveUserAvatar(owner.ID); err != nil {
		t.Fatalf("second remove: %v", err)
	}
}

func TestBuildAvatarPathString_IsUnderTheDataDir(t *testing.T) {
	path, err := utils.BuildAvatarPathString(42)
	if err != nil {
		t.Fatal(err)
	}
	if err := utils.AssertWithinDataDir(path); err != nil {
		t.Fatal(err)
	}
}
