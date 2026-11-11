package mcp

import (
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"errors"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// maxSearchResults bounds how many receipts a single search returns, matching
// the limit used by the REST search handler.
const maxSearchResults = 100

// emptyInput is the parameter type for tools that take no arguments. It yields
// an empty JSON object schema.
type emptyInput struct{}

type searchReceiptsInput struct {
	Query      string `json:"query"`
	MaxResults int    `json:"maxResults,omitempty"`
}

type getReceiptInput struct {
	Id string `json:"id"`
}

// registerTools wires the read-only MCP tools onto the server. Every handler
// derives the acting user from the verified token and enforces the same
// group-scoped authorization the REST handlers do.
func registerTools(server *mcpsdk.Server) {
	mcpsdk.AddTool(server, &mcpsdk.Tool{
		Name:        "search_receipts",
		Description: "Search the authenticated user's receipts by name. Returns receipts from groups the user belongs to, most recent first.",
	}, handleSearchReceipts)

	mcpsdk.AddTool(server, &mcpsdk.Tool{
		Name:        "get_receipt",
		Description: "Get a single receipt by id, including its items, categories, and tags. Only receipts in the user's groups are accessible.",
	}, handleGetReceipt)

	mcpsdk.AddTool(server, &mcpsdk.Tool{
		Name:        "list_groups",
		Description: "List the groups the authenticated user belongs to.",
	}, handleListGroups)

	mcpsdk.AddTool(server, &mcpsdk.Tool{
		Name:        "list_categories",
		Description: "List the receipt categories available to the authenticated user.",
	}, handleListCategories)

	mcpsdk.AddTool(server, &mcpsdk.Tool{
		Name:        "list_tags",
		Description: "List the receipt tags available to the authenticated user.",
	}, handleListTags)
}

func handleSearchReceipts(ctx context.Context, req *mcpsdk.CallToolRequest, in searchReceiptsInput) (*mcpsdk.CallToolResult, any, error) {
	claims, err := claimsFromRequest(req)
	if err != nil {
		return nil, nil, err
	}

	limit := in.MaxResults
	if limit <= 0 || limit > maxSearchResults {
		limit = maxSearchResults
	}

	// Delegate to the shared enforced read so REST and MCP can't drift: it
	// enforces app.receipts.search and scopes to the user's groups.
	results, err := services.NewReceiptService(nil).SearchReceiptsForUser(claims.UserId, in.Query, limit)
	if err != nil {
		if errors.Is(err, services.ErrSearchForbidden) {
			return nil, nil, errors.New("unauthorized")
		}
		return nil, nil, err
	}

	return nil, map[string]any{"receipts": results}, nil
}

func handleGetReceipt(ctx context.Context, req *mcpsdk.CallToolRequest, in getReceiptInput) (*mcpsdk.CallToolResult, any, error) {
	claims, err := claimsFromRequest(req)
	if err != nil {
		return nil, nil, err
	}

	if len(in.Id) == 0 {
		return nil, nil, errors.New("id is required")
	}

	// Delegate to the shared enforced read. Collapse every access failure to a non-leaking
	// "receipt not found" so we don't disclose the existence of receipts in
	// other users' groups.
	receipt, err := services.NewReceiptService(nil).GetReceiptForUser(claims.UserId, in.Id)
	if err != nil {
		if errors.Is(err, services.ErrReceiptAccessDenied) {
			return nil, nil, errors.New("receipt not found")
		}
		return nil, nil, err
	}

	return nil, receipt, nil
}

func handleListGroups(ctx context.Context, req *mcpsdk.CallToolRequest, _ emptyInput) (*mcpsdk.CallToolResult, any, error) {
	claims, err := claimsFromRequest(req)
	if err != nil {
		return nil, nil, err
	}

	groupService := services.NewGroupService(nil)
	groups, err := groupService.GetGroupsForUser(utils.UintToString(claims.UserId))
	if err != nil {
		return nil, nil, err
	}

	return nil, map[string]any{"groups": groups}, nil
}

func handleListCategories(ctx context.Context, req *mcpsdk.CallToolRequest, _ emptyInput) (*mcpsdk.CallToolResult, any, error) {
	claims, err := claimsFromRequest(req)
	if err != nil {
		return nil, nil, err
	}

	categories, err := repositories.NewCategoryRepository(nil).GetAllCategories("*")
	if err != nil {
		return nil, nil, err
	}

	visible, err := visibleCatalog(claims.UserId, categories, permissions.AppCategoriesRead)
	if err != nil {
		return nil, nil, err
	}

	return nil, map[string]any{"categories": visible}, nil
}

func handleListTags(ctx context.Context, req *mcpsdk.CallToolRequest, _ emptyInput) (*mcpsdk.CallToolResult, any, error) {
	claims, err := claimsFromRequest(req)
	if err != nil {
		return nil, nil, err
	}

	tags, err := repositories.NewTagsRepository(nil).GetAllTags("*")
	if err != nil {
		return nil, nil, err
	}

	visible, err := visibleCatalog(claims.UserId, tags, permissions.AppTagsRead)
	if err != nil {
		return nil, nil, err
	}

	return nil, map[string]any{"tags": visible}, nil
}

// visibleCatalog answers a global catalog (categories or tags) as the user may see
// it, mirroring how GetAppData builds the per-group catalogs: holders of the
// app-level read permission and every member of a household see the whole pool;
// a user in no household sees nothing.
func visibleCatalog[T any](userId uint, all []T, appReadPermission string) ([]T, error) {
	bypass, err := services.NewPermissionService(nil).HasAppPermissions(userId, appReadPermission)
	if err != nil {
		return nil, err
	}
	if bypass {
		return all, nil
	}

	groupIds, err := repositories.NewGroupMemberRepository(nil).GetGroupIdsByUserId(utils.UintToString(userId))
	if err != nil {
		return nil, err
	}
	if len(groupIds) == 0 {
		return []T{}, nil
	}
	return all, nil
}

// claimsFromRequest retrieves the verified user claims that verifyToken stashed
// on the bearer TokenInfo.
func claimsFromRequest(req *mcpsdk.CallToolRequest) (*structs.Claims, error) {
	if req.Extra == nil || req.Extra.TokenInfo == nil {
		return nil, errors.New("missing authentication context")
	}

	claims, ok := req.Extra.TokenInfo.Extra[claimsKey].(*structs.Claims)
	if !ok || claims == nil {
		return nil, errors.New("invalid authentication context")
	}

	return claims, nil
}
