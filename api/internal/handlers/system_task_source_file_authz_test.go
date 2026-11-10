package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/utils"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/go-chi/chi/v5"
)

// sourceFileAuthzFixture is one household holding a QUICK_SCAN activity run by
// memberB, plus the viewers whose answers must differ.
type sourceFileAuthzFixture struct {
	taskId   uint
	memberA  uint // another member of the household
	memberB  uint // ran the activity
	outsider uint // not in the household at all
}

func seedSourceFileUser(t *testing.T, username string) uint {
	t.Helper()

	user := models.User{Username: username, Password: "password"}
	if err := repositories.GetDB().Create(&user).Error; err != nil {
		t.Fatalf("user %s: %v", username, err)
	}
	return user.ID
}

func seedSourceFileAuthzFixture(t *testing.T) sourceFileAuthzFixture {
	t.Helper()
	services.ClearRolePermissionCacheForTests()

	db := repositories.GetDB()
	roleRepository := repositories.NewRoleRepository(nil)

	group := models.Group{Name: "source-file-household"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("group: %v", err)
	}

	perms := []string{permissions.GroupActivitiesRead, permissions.GroupActivitiesRerun}
	memberRole, err := roleRepository.CreateGroupRole("Source File Member", "", perms)
	if err != nil {
		t.Fatalf("member role: %v", err)
	}

	fixture := sourceFileAuthzFixture{
		memberA:  seedSourceFileUser(t, "source-file-a"),
		memberB:  seedSourceFileUser(t, "source-file-b"),
		outsider: seedSourceFileUser(t, "source-file-out"),
	}

	for _, member := range []models.GroupMember{
		{GroupID: group.ID, UserID: fixture.memberA, GroupRoleID: &memberRole.ID},
		{GroupID: group.ID, UserID: fixture.memberB, GroupRoleID: &memberRole.ID},
	} {
		if err := db.Create(&member).Error; err != nil {
			t.Fatalf("member: %v", err)
		}
	}

	groupId := group.ID
	ranBy := fixture.memberB
	task := models.SystemTask{
		Type:                 models.QUICK_SCAN,
		Status:               models.SYSTEM_TASK_FAILED,
		AssociatedEntityType: models.NOOP_ENTITY_TYPE,
		GroupId:              &groupId,
		RanByUserId:          &ranBy,
		JobId:                "source-file-task",
		StartedAt:            time.Now(),
	}
	if err := db.Create(&task).Error; err != nil {
		t.Fatalf("task: %v", err)
	}
	fixture.taskId = task.ID

	return fixture
}

func sourceFileRequest(t *testing.T, taskId uint, userId uint) (*httptest.ResponseRecorder, *http.Request) {
	t.Helper()

	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api", nil)

	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("id", utils.UintToString(taskId))
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, routeContext))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claimsForUser(userId)))

	return w, r
}

// Everyone in a household sees its activities, whoever ran them: both members get past
// the gate and fail later, at the job lookup (no job was queued here).
func TestSourceFileEndpointsAdmitEveryMember(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedSourceFileAuthzFixture(t)

	for _, viewer := range []struct {
		name   string
		userId uint
	}{
		{"the member who ran it", fixture.memberB},
		{"another member", fixture.memberA},
	} {
		t.Run(viewer.name, func(t *testing.T) {
			w, r := sourceFileRequest(t, fixture.taskId, viewer.userId)
			GetSystemTaskSourceFile(w, r)

			if w.Result().StatusCode == http.StatusForbidden {
				t.Errorf("status = 403 for %s, want the request to pass the gate", viewer.name)
			}
		})
	}
}

// A non-member has no group permission, so HandleRequest denies.
func TestSourceFileEndpointsDenyANonMember(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedSourceFileAuthzFixture(t)

	w, r := sourceFileRequest(t, fixture.taskId, fixture.outsider)
	GetSystemTaskSourceFile(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403; body=%s", w.Result().StatusCode, w.Body.String())
	}
}

// seedActivityOfType adds a second activity to the fixture's household, run by the
// same member, so a type-specific branch can be exercised under the same
// authorization conditions.
func seedActivityOfType(t *testing.T, fixture sourceFileAuthzFixture, taskType models.SystemTaskType) uint {
	t.Helper()

	existing := models.SystemTask{}
	if err := repositories.GetDB().First(&existing, fixture.taskId).Error; err != nil {
		t.Fatalf("fixture task: %v", err)
	}

	task := models.SystemTask{
		Type:                 taskType,
		Status:               models.SYSTEM_TASK_FAILED,
		AssociatedEntityType: models.NOOP_ENTITY_TYPE,
		GroupId:              existing.GroupId,
		RanByUserId:          existing.RanByUserId,
		JobId:                "source-file-task-2",
		StartedAt:            time.Now(),
	}
	if err := repositories.GetDB().Create(&task).Error; err != nil {
		t.Fatalf("task: %v", err)
	}

	return task.ID
}

// An id that names no task at all must answer exactly like one the caller may not
// reach. Asserting the status alone proves nothing: the two denials are written by
// two different places (this file's task lookup and HandleRequest's group gate), so
// they have to agree on the body as well.
//
// Before this, GetSystemTaskById's gorm.ErrRecordNotFound surfaced as a 500 while a
// denied task returned 403, so the status code was an existence oracle for arbitrary
// task ids one layer above the gate that was meant to close it. Closing it with a
// message of this feature's own then left the same oracle in the BODY, since the
// group gate writes its own.
func TestSourceFileEndpointsAnswerAnUnknownTaskIdLikeADeniedOne(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedSourceFileAuthzFixture(t)

	const unknownTaskId = 987654

	for _, endpoint := range []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"preview", GetSystemTaskSourceFile},
		{"download", DownloadSystemTaskSourceFile},
		{"rerun", RerunActivity},
	} {
		t.Run(endpoint.name, func(t *testing.T) {
			answer := func(taskId uint, userId uint) (int, string) {
				w, r := sourceFileRequest(t, taskId, userId)
				endpoint.handler(w, r)
				return w.Result().StatusCode, w.Body.String()
			}

			unknownStatus, unknownBody := answer(unknownTaskId, fixture.outsider)
			// Refused by HandleRequest's group gate, which writes its own body.
			outsiderStatus, outsiderBody := answer(fixture.taskId, fixture.outsider)

			if unknownStatus != outsiderStatus {
				t.Errorf(
					"unknown id status = %d, denied status = %d; the two must be indistinguishable",
					unknownStatus, outsiderStatus,
				)
			}

			if unknownBody != outsiderBody {
				t.Errorf(
					"unknown id body = %s, denied body = %s; the two must be indistinguishable",
					unknownBody, outsiderBody,
				)
			}

			// Pinned explicitly, so a regression that makes BOTH answers a 500
			// cannot pass the comparisons above.
			if outsiderStatus != http.StatusForbidden {
				t.Errorf("denied status = %d, want 403; body=%s", outsiderStatus, outsiderBody)
			}
		})
	}
}

// RerunActivity's "only a quick scan can be rerun" check used to run before the handler
// was built, so it answered ahead of the permission gate and told an unauthorized caller
// the activity's type. A caller who may not reach the activity must get the same 403 as
// for any other task.
func TestRerunActivityHidesTheTaskTypeFromAnUnauthorizedCaller(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedSourceFileAuthzFixture(t)
	nonRerunnableTaskId := seedActivityOfType(t, fixture, models.MAGIC_FILL)

	w, r := sourceFileRequest(t, nonRerunnableTaskId, fixture.outsider)
	RerunActivity(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403; body=%s", w.Result().StatusCode, w.Body.String())
	}
}

// The contrast: a member still gets the 400, so moving the check behind the gate did
// not quietly drop it. The type check precedes the job lookup.
func TestRerunActivityStillRejectsANonRerunnableTypeForAnAuthorizedCaller(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedSourceFileAuthzFixture(t)
	nonRerunnableTaskId := seedActivityOfType(t, fixture, models.MAGIC_FILL)

	w, r := sourceFileRequest(t, nonRerunnableTaskId, fixture.memberA)
	RerunActivity(w, r)

	if w.Result().StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400; body=%s", w.Result().StatusCode, w.Body.String())
	}
}
