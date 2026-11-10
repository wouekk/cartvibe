package structs

type About struct {
	BuildDate string `json:"buildDate"`
	Version   string `json:"version"`
	// RunsAsRoot is true when the API process is root: the container was started with ALLOW_ROOT=1 because its
	// folders refuse the unprivileged user (docker/entrypoint.sh). The About page tells an admin.
	RunsAsRoot bool `json:"runsAsRoot"`
}
