package services

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// MaxAvatarBytes caps an avatar upload. The web app shrinks a photo to 512px before sending it (tens of KB); the cap
// leaves room for a file a browser could not shrink (HEIC on most browsers) without accepting anything receipt-sized.
const MaxAvatarBytes = 8 << 20

var (
	ErrAvatarTooLarge = errors.New("the photo is too large: 8 MB at most")
	ErrAvatarType     = errors.New("the photo must be a JPEG, PNG, WebP, GIF, HEIC, TIFF or PDF file")
	ErrAvatarNotFound = errors.New("no avatar")
)

// avatarWebTypes are the formats every browser draws in an <img>; the other receipt formats are turned into a JPEG
// when they are uploaded, so the stored photo is always one of these.
var avatarWebTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

// SaveUserAvatar validates and stores a person's avatar photo under data/avatars/ and returns when it was saved.
// Only the receipt formats are accepted (FileRepository.ValidateFileType); HEIC, TIFF and PDF become a JPEG.
func SaveUserAvatar(userId uint, data []byte) (time.Time, error) {
	if len(data) > MaxAvatarBytes {
		return time.Time{}, ErrAvatarTooLarge
	}

	fileRepository := repositories.NewFileRepository(nil)
	fileType, err := fileRepository.ValidateFileType(data)
	if err != nil {
		return time.Time{}, ErrAvatarType
	}

	if !avatarWebTypes[fileType] {
		if fileType == constants.ApplicationPdf {
			data, err = fileRepository.ConvertPdfToJpg(data)
		} else {
			// ImageMagick reads HEIC/HEIF and TIFF alike; this writes the first frame as a JPEG.
			data, err = fileRepository.ConvertHeicToJpg(data)
		}
		if err != nil {
			return time.Time{}, ErrAvatarType
		}
	}

	path, err := utils.BuildAvatarPathString(userId)
	if err != nil {
		return time.Time{}, err
	}
	if err := utils.EnsureDataDirectory(filepath.Dir(path)); err != nil {
		return time.Time{}, err
	}
	if err := utils.WriteDataFile(path, data); err != nil {
		return time.Time{}, err
	}

	// Whole seconds: the time is echoed into the photo's address and compared as text by SQLite.
	savedAt := time.Now().UTC().Truncate(time.Second)
	err = repositories.GetDB().Model(&models.User{}).Where("id = ?", userId).Update("avatar_updated_at", savedAt).Error
	if err != nil {
		return time.Time{}, err
	}
	return savedAt, nil
}

// RemoveUserAvatar deletes the photo, so the initials show again.
func RemoveUserAvatar(userId uint) error {
	if err := RemoveUserAvatarFile(userId); err != nil {
		return err
	}
	return repositories.GetDB().Model(&models.User{}).Where("id = ?", userId).Update("avatar_updated_at", nil).Error
}

// RemoveUserAvatarFile deletes the stored photo file, if there is one.
func RemoveUserAvatarFile(userId uint) error {
	path, err := utils.BuildAvatarPathString(userId)
	if err != nil {
		return err
	}
	exists, err := utils.DataPathExists(path)
	if err != nil || !exists {
		return err
	}
	return utils.RemoveDataPath(path)
}

// ReadUserAvatar returns a person's photo and its content type for a signed-in viewer. A person the viewer may not
// see (member isolation) reads as having no photo, the same answer as someone without one, so nothing leaks.
func ReadUserAvatar(viewerId uint, userId uint) ([]byte, string, error) {
	if viewerId != userId {
		visible, unrestricted, err := NewPermissionService(nil).GetVisibleUserIdsForUser(viewerId)
		if err != nil {
			return nil, "", err
		}
		if !unrestricted {
			if _, ok := visible[userId]; !ok {
				return nil, "", ErrAvatarNotFound
			}
		}
	}

	path, err := utils.BuildAvatarPathString(userId)
	if err != nil {
		return nil, "", err
	}
	data, err := utils.ReadDataFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, "", ErrAvatarNotFound
	}
	if err != nil {
		return nil, "", err
	}

	contentType := utils.GetMimeType(data).String()
	if !avatarWebTypes[contentType] {
		return nil, "", ErrAvatarNotFound
	}
	return data, contentType, nil
}
