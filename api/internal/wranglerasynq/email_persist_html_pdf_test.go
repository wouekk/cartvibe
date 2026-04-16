package wranglerasynq

import (
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"testing"
	"time"
)

func TestPersistHtmlToPdfSystemTask_EmptyTypeIsNoOp(t *testing.T) {
	repo := repositories.NewSystemTaskRepository(nil)
	db := repositories.GetDB()
	uniqueTaskId := "test-noop-empty-type"

	persistHtmlToPdfSystemTask(repo, commands.UpsertSystemTaskCommand{}, models.GroupSettings{}, uniqueTaskId, nil)

	var count int64
	if err := db.Model(&models.SystemTask{}).Where("asynq_task_id = ?", uniqueTaskId).Count(&count).Error; err != nil {
		t.Fatalf("count query failed: %v", err)
	}
	if count != 0 {
		t.Errorf("expected zero rows for empty Type (no-op), found %d", count)
	}
}

func TestPersistHtmlToPdfSystemTask_PersistsOrphaned(t *testing.T) {
	repo := repositories.NewSystemTaskRepository(nil)
	db := repositories.GetDB()
	uniqueTaskId := "test-persist-orphaned"
	const systemEmailId uint = 4242

	cmd := commands.UpsertSystemTaskCommand{
		Type:              models.HTML_TO_PDF,
		Status:            models.SYSTEM_TASK_SUCCEEDED,
		StartedAt:         time.Now(),
		ResultDescription: "rendered orphaned",
	}
	groupSettings := models.GroupSettings{
		SystemEmail: models.SystemEmail{BaseModel: models.BaseModel{ID: systemEmailId}},
	}

	persistHtmlToPdfSystemTask(repo, cmd, groupSettings, uniqueTaskId, nil)

	var saved models.SystemTask
	if err := db.Where("asynq_task_id = ?", uniqueTaskId).First(&saved).Error; err != nil {
		t.Fatalf("expected persisted system task, got: %v", err)
	}

	if saved.Type != models.HTML_TO_PDF {
		t.Errorf("expected Type HTML_TO_PDF, got %s", saved.Type)
	}
	if saved.Status != models.SYSTEM_TASK_SUCCEEDED {
		t.Errorf("expected Status SUCCEEDED, got %s", saved.Status)
	}
	if saved.AssociatedEntityType != models.SYSTEM_EMAIL {
		t.Errorf("expected AssociatedEntityType SYSTEM_EMAIL, got %s", saved.AssociatedEntityType)
	}
	if saved.AssociatedEntityId != systemEmailId {
		t.Errorf("expected AssociatedEntityId %d, got %d", systemEmailId, saved.AssociatedEntityId)
	}
	if saved.AssociatedSystemTaskId != nil {
		t.Errorf("expected AssociatedSystemTaskId nil for orphaned task, got %v", saved.AssociatedSystemTaskId)
	}
}

func TestPersistHtmlToPdfSystemTask_ChainsToParent(t *testing.T) {
	repo := repositories.NewSystemTaskRepository(nil)
	db := repositories.GetDB()
	uniqueTaskId := "test-persist-chained"
	const systemEmailId uint = 4243

	// Create a real parent system task so the FK constraint on
	// associated_system_task_id is satisfied.
	parentSystemTask, err := repo.CreateSystemTask(commands.UpsertSystemTaskCommand{
		Type:                 models.EMAIL_READ,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		AssociatedEntityType: models.SYSTEM_EMAIL,
		AssociatedEntityId:   systemEmailId,
		StartedAt:            time.Now(),
		AsynqTaskId:          "test-persist-chained-parent",
	})
	if err != nil {
		t.Fatalf("failed to create parent system task: %v", err)
	}

	cmd := commands.UpsertSystemTaskCommand{
		Type:              models.HTML_TO_PDF,
		Status:            models.SYSTEM_TASK_SUCCEEDED,
		StartedAt:         time.Now(),
		ResultDescription: "rendered chained",
	}
	groupSettings := models.GroupSettings{
		SystemEmail: models.SystemEmail{BaseModel: models.BaseModel{ID: systemEmailId}},
	}

	persistHtmlToPdfSystemTask(repo, cmd, groupSettings, uniqueTaskId, &parentSystemTask.ID)

	var saved models.SystemTask
	if err := db.Where("asynq_task_id = ?", uniqueTaskId).First(&saved).Error; err != nil {
		t.Fatalf("expected persisted system task, got: %v", err)
	}

	if saved.AssociatedSystemTaskId == nil {
		t.Fatal("expected AssociatedSystemTaskId to be set, got nil")
	}
	if *saved.AssociatedSystemTaskId != parentSystemTask.ID {
		t.Errorf("expected AssociatedSystemTaskId=%d, got %d", parentSystemTask.ID, *saved.AssociatedSystemTaskId)
	}
}
