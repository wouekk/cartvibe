package permissions

// The two roles that hold everything. Their rows keep the names they were seeded
// under ("Legacy Admin", "Legacy Owner"), which the app shows as Admin.

// scopeKeys returns every registry key for the given scope, so the roles that
// hold everything stay complete as the permission registry grows.
func scopeKeys(scope Scope) []string {
	out := make([]string, 0, len(registry))
	for _, descriptor := range registry {
		if descriptor.Scope == scope {
			out = append(out, descriptor.Key)
		}
	}
	return out
}

// LegacyAppAdminKeys returns every app-scope permission: what an Admin holds.
func LegacyAppAdminKeys() []string {
	return scopeKeys(ScopeApp)
}

// LegacyGroupOwnerKeys returns every group-scope permission: what the Owner of
// a household holds.
func LegacyGroupOwnerKeys() []string {
	return scopeKeys(ScopeGroup)
}
