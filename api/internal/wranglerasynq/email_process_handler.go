package wranglerasynq

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"time"
)

type EmailProcessTaskPayload struct {
	GroupSettingsId     uint
	ImageForOcrPath     string
	TempFilePath        string
	Metadata            structs.EmailMetadata
	Attachment          structs.Attachment
	BodyPdfPath         string
	BodyImageForOcrPath string
	BodyPdfFilename     string
	BodyPdfSize         uint
}

func HandleEmailProcessTask(context context.Context, task *asynq.Task) error {
	db := repositories.GetDB()
	systemTaskService := services.NewSystemTaskService(nil)
	groupSettingsRepository := repositories.NewGroupSettingsRepository(nil)
	var payload EmailProcessTaskPayload

	taskId, err := GetTaskIdFromContext(context)
	if err != nil {
		return HandleError(err)
	}

	err = json.Unmarshal(task.Payload(), &payload)
	if err != nil {
		return HandleError(err)
	}

	hasAttachmentImage := len(payload.ImageForOcrPath) > 0
	hasBodyImage := len(payload.BodyImageForOcrPath) > 0
	hasAnyImage := hasAttachmentImage || hasBodyImage

	var fileBytes []byte
	if len(payload.TempFilePath) > 0 {
		fileBytes, err = utils.ReadFile(payload.TempFilePath)
		if err != nil {
			return HandleError(err)
		}
	}

	var bodyPdfBytes []byte
	if len(payload.BodyPdfPath) > 0 {
		bodyPdfBytes, err = utils.ReadFile(payload.BodyPdfPath)
		if err != nil {
			return HandleError(err)
		}
	}

	groupSettingsIdString := utils.UintToString(payload.GroupSettingsId)
	groupSettingsToUse, err := groupSettingsRepository.GetGroupSettingsById(groupSettingsIdString)
	if err != nil {
		return HandleError(err)
	}

	if groupSettingsToUse.ID == 0 {
		return HandleError(fmt.Errorf("could not find group settings with id %d", payload.GroupSettingsId))
	}

	groupIdString := utils.UintToString(groupSettingsToUse.GroupId)

	var baseCommand commands.UpsertReceiptCommand
	var processingMetadata commands.ReceiptProcessingMetadata
	var processingErr error

	start := time.Now()
	if hasAnyImage {
		imagePaths := []string{}
		if hasAttachmentImage {
			imagePaths = append(imagePaths, payload.ImageForOcrPath)
		}
		if hasBodyImage {
			imagePaths = append(imagePaths, payload.BodyImageForOcrPath)
		}
		baseCommand, processingMetadata, processingErr = services.ReadReceiptImagesWithEmailBody(
			imagePaths,
			payload.Metadata.Body,
			hasBodyImage,
			groupIdString,
		)
	} else {
		baseCommand, processingMetadata, processingErr = services.ReadReceiptFromTextOnly(payload.Metadata.Body, groupIdString)
	}
	end := time.Now()

	metadataBytes, err := json.Marshal(payload.Metadata)
	if err != nil {
		return HandleError(err)
	}

	systemTaskRepository := repositories.NewSystemTaskRepository(nil)

	status := models.SYSTEM_TASK_SUCCEEDED
	if processingErr != nil {
		status = models.SYSTEM_TASK_FAILED
	}

	resultDescription := string(metadataBytes)
	if processingErr != nil {
		resultDescription = processingErr.Error()
	}

	emailReadSystemTask, err := systemTaskRepository.CreateSystemTask(
		commands.UpsertSystemTaskCommand{
			Type:                 models.EMAIL_READ,
			Status:               status,
			AssociatedEntityType: models.SYSTEM_EMAIL,
			AssociatedEntityId:   groupSettingsToUse.SystemEmail.ID,
			StartedAt:            start,
			EndedAt:              &end,
			RanByUserId:          nil,
			ResultDescription:    resultDescription,
			AsynqTaskId:          taskId,
		},
	)
	if err != nil {
		return HandleError(err)
	}

	processingSystemTasks, err := systemTaskService.CreateSystemTasksFromMetadata(
		processingMetadata,
		start,
		end,
		models.EMAIL_UPLOAD,
		nil,
		&groupSettingsToUse.GroupId,
		taskId,
		func(command commands.UpsertSystemTaskCommand) *uint {
			return &emailReadSystemTask.ID
		},
	)
	if err != nil {
		return HandleError(err)
	}

	if processingErr != nil {
		return HandleError(processingErr)
	}

	command := baseCommand
	command.GroupId = groupSettingsToUse.GroupId

	if len(command.Status) == 0 {
		command.Status = groupSettingsToUse.EmailDefaultReceiptStatus
	}

	if command.PaidByUserID == 0 {
		command.PaidByUserID = *groupSettingsToUse.EmailDefaultReceiptPaidById
	}

	command.CreatedByString = "Email Integration"

	vErr := command.Validate(0, true)
	if len(vErr.Errors) > 0 {
		errBytes, _ := json.Marshal(vErr.Errors)
		return HandleError(fmt.Errorf("receipt validation failed: %s", string(errBytes)))
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		receiptRepository := repositories.NewReceiptRepository(tx)
		receiptImageRepository := repositories.NewReceiptImageRepository(tx)
		systemTaskService.SetTransaction(tx)

		createdReceipt, err := receiptRepository.CreateReceipt(command, 0, false)
		_, taskErr := systemTaskService.CreateReceiptUploadedSystemTask(
			err,
			createdReceipt,
			processingSystemTasks,
			time.Now(),
		)
		if taskErr != nil {
			return HandleError(taskErr)
		}
		if err != nil {
			tx.Commit()
			return HandleError(taskErr)
		}

		err = systemTaskService.AssociateProcessingSystemTasksToReceipt(processingSystemTasks, createdReceipt.ID)
		if err != nil {
			return HandleError(err)
		}

		if hasAttachmentImage {
			fileData := models.FileData{
				ReceiptId: createdReceipt.ID,
				Name:      payload.Attachment.Filename,
				FileType:  payload.Attachment.FileType,
				Size:      payload.Attachment.Size,
			}

			_, err = receiptImageRepository.CreateReceiptImage(fileData, fileBytes)
			if err != nil {
				return HandleError(err)
			}
		}

		if len(payload.BodyPdfPath) > 0 && len(bodyPdfBytes) > 0 {
			bodyFileData := models.FileData{
				ReceiptId: createdReceipt.ID,
				Name:      payload.BodyPdfFilename,
				FileType:  constants.ApplicationPdf,
				Size:      payload.BodyPdfSize,
			}

			_, err = receiptImageRepository.CreateReceiptImage(bodyFileData, bodyPdfBytes)
			if err != nil {
				return HandleError(err)
			}
		}

		return nil
	})

	return err
}
