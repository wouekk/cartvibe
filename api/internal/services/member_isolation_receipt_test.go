package services

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"testing"
)

// isolatedReceiptFixture is an isolated group with a supervisor (SeesAllMembers)
// and two plain isolated members, all holding group.receipts.read. Member A and
// member B cannot see each other; both can see the supervisor.
type isolatedReceiptFixture struct {
	groupId      uint
	supervisorId uint
	memberAId    uint
	memberBId    uint
	memberRoleId uint
	supRoleId    uint
}

func seedIsolatedReceiptGroup(t *testing.T) isolatedReceiptFixture {
	t.Helper()
	db := repositories.GetDB()
	roleRepository := repositories.NewRoleRepository(nil)

	group := models.Group{Name: "iso-receipt-group", IsolateMembers: true}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}

	supRole, err := roleRepository.CreateGroupRole(
		"Iso Supervisor", "", []string{permissions.GroupReceiptsRead}, nil, nil, nil, false, true,
	)
	if err != nil {
		t.Fatalf("seed supervisor role: %v", err)
	}
	memberRole, err := roleRepository.CreateGroupRole(
		"Iso Member", "", []string{permissions.GroupReceiptsRead}, nil, nil, nil, false, false,
	)
	if err != nil {
		t.Fatalf("seed member role: %v", err)
	}

	sup := makeUser(t, "iso-supervisor-user")
	a := makeUser(t, "iso-member-a")
	b := makeUser(t, "iso-member-b")

	seedIsoMember(t, group.ID, sup, &supRole.ID)
	seedIsoMember(t, group.ID, a, &memberRole.ID)
	seedIsoMember(t, group.ID, b, &memberRole.ID)

	return isolatedReceiptFixture{
		groupId:      group.ID,
		supervisorId: sup,
		memberAId:    a,
		memberBId:    b,
		memberRoleId: memberRole.ID,
		supRoleId:    supRole.ID,
	}
}

func resetIsolationCaches() {
	clearRolePermissionCacheAll()
	clearGroupRoleGrantCacheAll()
}

// --- Piece 1: paid-by fold (surface B) ---

func TestMemberIsolation_PaidByFold_HidesReceiptPaidByNonVisibleMember(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	receipts := []models.Receipt{
		{GroupId: fx.groupId, PaidByUserID: fx.memberAId},    // A's own
		{GroupId: fx.groupId, PaidByUserID: fx.memberBId},    // B's — non-visible to A
		{GroupId: fx.groupId, PaidByUserID: fx.supervisorId}, // supervisor — visible to A
	}

	filtered, err := service.FilterReceiptsByPaidBy(fx.memberAId, receipts)
	if err != nil {
		t.Fatalf("FilterReceiptsByPaidBy: %v", err)
	}
	if len(filtered) != 2 {
		t.Fatalf("expected 2 visible receipts (own + supervisor), got %d: %v", len(filtered), filtered)
	}
	for _, r := range filtered {
		if r.PaidByUserID == fx.memberBId {
			t.Errorf("receipt paid by non-visible member B leaked to A")
		}
	}
}

func TestMemberIsolation_PaidByFold_ReceiptPaidByVisible(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	cases := []struct {
		name   string
		payer  uint
		expect bool
	}{
		{"own receipt visible", fx.memberAId, true},
		{"supervisor receipt visible", fx.supervisorId, true},
		{"peer receipt hidden", fx.memberBId, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			visible, err := service.ReceiptPaidByVisible(fx.memberAId, fx.groupId, c.payer)
			if err != nil {
				t.Fatalf("ReceiptPaidByVisible: %v", err)
			}
			if visible != c.expect {
				t.Errorf("visible = %v, want %v", visible, c.expect)
			}
		})
	}
}

func TestMemberIsolation_PaidByFold_ResolverRestrictedToVisibleSet(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	resolver := service.PaidByListResolver(fx.memberAId)
	allowed, unrestricted, err := resolver(fx.groupId)
	if err != nil {
		t.Fatalf("resolver: %v", err)
	}
	if unrestricted {
		t.Fatal("expected an isolated member to resolve as restricted")
	}

	got := make(map[uint]struct{}, len(allowed))
	for _, id := range allowed {
		got[id] = struct{}{}
	}
	if _, ok := got[fx.memberAId]; !ok {
		t.Errorf("expected own id in allowed set %v", allowed)
	}
	if _, ok := got[fx.supervisorId]; !ok {
		t.Errorf("expected supervisor id in allowed set %v", allowed)
	}
	if _, ok := got[fx.memberBId]; ok {
		t.Errorf("peer id must NOT be in allowed set %v", allowed)
	}
}

func TestMemberIsolation_PaidByFold_SupervisorUnrestricted(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	// The supervisor sees every member, so paid-by is unaffected: all receipts survive.
	receipts := []models.Receipt{
		{GroupId: fx.groupId, PaidByUserID: fx.memberAId},
		{GroupId: fx.groupId, PaidByUserID: fx.memberBId},
	}
	filtered, err := service.FilterReceiptsByPaidBy(fx.supervisorId, receipts)
	if err != nil {
		t.Fatalf("FilterReceiptsByPaidBy: %v", err)
	}
	if len(filtered) != 2 {
		t.Errorf("expected supervisor to see all receipts, got %d", len(filtered))
	}

	_, unrestricted, err := service.PaidByListResolver(fx.supervisorId)(fx.groupId)
	if err != nil {
		t.Fatalf("resolver: %v", err)
	}
	if !unrestricted {
		t.Error("expected supervisor resolver to be unrestricted")
	}
}

// --- Piece 2: field masking (surface C) ---

func TestMemberIsolation_Mask_CreatedByNulledForNonVisible(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	bId := fx.memberBId
	receipt := models.Receipt{
		BaseModel:    models.BaseModel{CreatedBy: &bId, CreatedByString: "Member B"},
		GroupId:      fx.groupId,
		PaidByUserID: fx.memberAId,
	}

	if err := service.MaskReceiptForMemberVisibility(fx.memberAId, &receipt); err != nil {
		t.Fatalf("mask: %v", err)
	}
	if receipt.CreatedBy != nil {
		t.Errorf("expected createdBy nulled for non-visible creator, got %v", *receipt.CreatedBy)
	}
	if receipt.CreatedByString != "" {
		t.Errorf("expected createdByString cleared, got %q", receipt.CreatedByString)
	}
}

func TestMemberIsolation_Mask_CreatedByUnchangedForVisible(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	supId := fx.supervisorId
	receipt := models.Receipt{
		BaseModel:    models.BaseModel{CreatedBy: &supId, CreatedByString: "Supervisor"},
		GroupId:      fx.groupId,
		PaidByUserID: fx.memberAId,
	}

	if err := service.MaskReceiptForMemberVisibility(fx.memberAId, &receipt); err != nil {
		t.Fatalf("mask: %v", err)
	}
	if receipt.CreatedBy == nil || *receipt.CreatedBy != supId {
		t.Errorf("expected createdBy for a visible creator to be unchanged, got %v", receipt.CreatedBy)
	}
	if receipt.CreatedByString != "Supervisor" {
		t.Errorf("expected createdByString preserved, got %q", receipt.CreatedByString)
	}
}

// --- Piece 3: comment author drop (surface D) ---

func TestMemberIsolation_DropCommentAuthoredByNonVisible(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	aId := fx.memberAId
	bId := fx.memberBId
	receipt := models.Receipt{
		GroupId:      fx.groupId,
		PaidByUserID: aId,
		Comments: []models.Comment{
			{Comment: "from A", UserId: &aId},
			{Comment: "from B", UserId: &bId},
		},
	}

	if err := service.MaskReceiptForMemberVisibility(aId, &receipt); err != nil {
		t.Fatalf("mask: %v", err)
	}
	if len(receipt.Comments) != 1 {
		t.Fatalf("expected 1 surviving comment (A's), got %d: %v", len(receipt.Comments), receipt.Comments)
	}
	if receipt.Comments[0].UserId == nil || *receipt.Comments[0].UserId != aId {
		t.Errorf("expected the surviving comment to be A's, got %v", receipt.Comments[0])
	}
}

func TestMemberIsolation_DropComment_NoopForUnrestrictedViewer(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	aId := fx.memberAId
	bId := fx.memberBId
	receipt := models.Receipt{
		GroupId:      fx.groupId,
		PaidByUserID: aId,
		Comments: []models.Comment{
			{Comment: "from A", UserId: &aId},
			{Comment: "from B", UserId: &bId},
		},
	}

	if err := service.MaskReceiptForMemberVisibility(fx.supervisorId, &receipt); err != nil {
		t.Fatalf("mask: %v", err)
	}
	if len(receipt.Comments) != 2 {
		t.Errorf("expected both comments kept for unrestricted viewer, got %d", len(receipt.Comments))
	}
}

// --- Piece 4: write-side guard (task 8) ---

// --- Backward compatibility (non-isolated / unrestricted viewers) ---

func TestMemberIsolation_ValidateReceiptUserSelection(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetIsolationCaches()

	fx := seedIsolatedReceiptGroup(t)
	service := NewPermissionService(nil)

	cases := []struct {
		name        string
		viewer      uint
		paidBy      uint
		expectAllow bool
	}{
		{"A pays with non-visible B", fx.memberAId, fx.memberBId, false},
		{"A pays self", fx.memberAId, fx.memberAId, true},
		{"A pays visible supervisor", fx.memberAId, fx.supervisorId, true},
		{"supervisor is unrestricted", fx.supervisorId, fx.memberBId, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			allowed, err := service.ValidateReceiptUserSelection(c.viewer, fx.groupId, c.paidBy)
			if err != nil {
				t.Fatalf("ValidateReceiptUserSelection: %v", err)
			}
			if allowed != c.expectAllow {
				t.Errorf("allowed = %v, want %v", allowed, c.expectAllow)
			}
		})
	}
}
