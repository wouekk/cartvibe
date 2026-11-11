package routers

import (
	"cartvibe/api/internal/corspolicy"
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/mcp"
	"cartvibe/api/internal/oauth"
	"cartvibe/api/internal/services"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func BuildRootRouter() *chi.Mux {
	// Checked once at start, so a bad signing configuration stops the boot instead of failing every request.
	if _, err := services.InitTokenValidator(); err != nil {
		logging.LogStd(logging.LOG_LEVEL_FATAL, err.Error())
	}
	env := config.GetDeployEnv()

	rootRouter := chi.NewRouter()

	// TODO: this policy is not ready for production yet. Need to add more configuration options to make sure we aren't using less secure options
	if env == "dev" {
		cors := corspolicy.GetCorsPolicy()
		rootRouter.Use(cors.Handler)
	}

	// Token Refresh Router
	refreshRouter := BuildTokenRefreshRouter()
	rootRouter.Mount("/api/token", refreshRouter)

	// Signup Router
	signUpRouter := BuildSignUpRouter()
	rootRouter.Mount("/api/signUp", signUpRouter)

	// Login Router
	loginRouter := BuildLoginRouter()
	rootRouter.Mount("/api/login", loginRouter)

	// Logout router
	logoutRouter := BuildLogoutRouter()
	rootRouter.Mount("/api/logout", logoutRouter)

	// Receipt Router
	receiptRouter := BuildReceiptRouter()
	rootRouter.Mount("/api/receipt", receiptRouter)

	// Receipt Image Router
	receiptImageRouter := BuildReceiptImageRouter()
	rootRouter.Mount("/api/receiptImage", receiptImageRouter)

	// Tag Router
	tagRouter := BuildTagRouter()
	rootRouter.Mount("/api/tag", tagRouter)

	// Category Router
	categoryRouter := BuildCategoryRouter()
	rootRouter.Mount("/api/category", categoryRouter)

	// User Router
	userRouter := BuildUserRouter()
	rootRouter.Mount("/api/user", userRouter)

	// Add validaiton on update group that at least one user has owner, and that must have at least 1 user
	// Group Router
	groupRouter := BuildGroupRouter()
	rootRouter.Mount("/api/group", groupRouter)

	// Feature Config Router
	// Content-Security-Policy reports from the browser (no sign-in; nginx limits them).
	rootRouter.Post("/api/cspReport", handlers.CspReport)

	featureConfigRouter := BuildFeatureConfigRouter()
	rootRouter.Mount("/api/featureConfig", featureConfigRouter)

	// OIDC relying party (sign in with an external identity provider)
	oidcRouter := BuildOidcRouter()
	rootRouter.Mount("/api/oidc", oidcRouter)

	// OIDC provider administration
	oidcProviderRouter := BuildOidcProviderRouter()
	rootRouter.Mount("/api/oidcProvider", oidcProviderRouter)


	// Notification router
	notificationRouter := BuildNotificationRouter()
	rootRouter.Mount("/api/notifications", notificationRouter)

	//User Preferences router
	userPreferencesRouter := BuildUserPreferencesRouter()
	rootRouter.Mount("/api/userPreferences", userPreferencesRouter)

	// Dashboard layout router (the landing page's panel arrangement, per user)
	dashboardLayoutRouter := BuildDashboardLayoutRouter()
	rootRouter.Mount("/api/dashboardLayout", dashboardLayoutRouter)

	shopLogoRouter := BuildShopLogoRouter()
	rootRouter.Mount("/api/shopLogo", shopLogoRouter)



	// System Task router
	systemTaskRouter := BuildSystemTaskRouter()
	rootRouter.Mount("/api/systemTask", systemTaskRouter)

	// Receipt Processing Settings router
	receiptProcessingSettingsRouter := BuildReceiptProcessingSettingsRouter()
	rootRouter.Mount("/api/receiptProcessingSettings", receiptProcessingSettingsRouter)


	// System Settings router
	systemSettingsRouter := BuildSystemSettingsRouter()
	rootRouter.Mount("/api/systemSettings", systemSettingsRouter)


	// Export router
	exportRouter := BuildExportRouter()
	rootRouter.Mount("/api/export", exportRouter)

	// Household export router
	backupRouter := BuildBackupRouter()
	rootRouter.Mount("/api/backup", backupRouter)

	// Report router
	reportRouter := BuildReportRouter()
	rootRouter.Mount("/api/report", reportRouter)

	// Permission router
	permissionRouter := BuildPermissionRouter()
	rootRouter.Mount("/api/permission", permissionRouter)

	// Role router
	roleRouter := BuildRoleRouter()
	rootRouter.Mount("/api/role", roleRouter)

	// Shopping list router
	shoppingListRouter := BuildShoppingListRouter()
	rootRouter.Mount("/api/shopping-list", shoppingListRouter)

	// Overview router (the landing page's month at a glance)
	overviewRouter := BuildOverviewRouter()
	rootRouter.Mount("/api/overview", overviewRouter)

	exchangeRateRouter := BuildExchangeRateRouter()
	rootRouter.Mount("/api/exchangeRate", exchangeRateRouter)

	// Receipt product router (the products the AI read off each receipt)
	receiptProductRouter := BuildReceiptProductRouter()
	rootRouter.Mount("/api/receipt-product", receiptProductRouter)

	// MCP server + OAuth 2.1 authorization endpoints. These are mounted at the
	// server root because the OAuth discovery documents must live at well-known
	// root paths. Unlike background workers, HTTP routes can only be mounted
	// once at startup, so rather than re-mounting when the operator toggles the
	// server, the handlers are always mounted and gated at request time by the
	// live MCP_ENABLED System Setting (see mcpEnabledMiddleware).
	mountMcpRoutes(rootRouter)

	return rootRouter
}

// mcpEnabledMiddleware short-circuits MCP/OAuth requests with a 404 whenever the
// MCP server is disabled in System Settings, so the always-mounted routes
// behave as if absent until an admin enables them — no restart required.
func mcpEnabledMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !services.IsMcpEnabled() {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// mountMcpRoutes wires the MCP Streamable HTTP endpoint and the self-hosted
// OAuth 2.1 authorization-server endpoints used by MCP clients such as Claude.
func mountMcpRoutes(rootRouter *chi.Mux) {
	mcpHandler := mcp.NewHandler()

	rootRouter.Group(func(r chi.Router) {
		r.Use(mcpEnabledMiddleware)

		r.Get("/.well-known/oauth-protected-resource", oauth.ProtectedResourceMetadata)
		r.Get("/.well-known/oauth-authorization-server", oauth.AuthorizationServerMetadata)

		r.Post("/oauth/register", oauth.Register)
		r.Get("/oauth/authorize", oauth.AuthorizeForm)
		r.Post("/oauth/authorize", oauth.Authorize)
		r.Post("/oauth/token", oauth.Token)

		r.Handle("/mcp", mcpHandler)
		r.Handle("/mcp/*", mcpHandler)
	})
}
