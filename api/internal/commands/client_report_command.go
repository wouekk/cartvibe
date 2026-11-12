package commands

// ClientReportCommand is the web app telling the server about something that went wrong in the browser, where the
// server could not have seen it: a photo that never became an upload, say. The server only writes it to its log.
type ClientReportCommand struct {
	// Kind names what happened, in lower-case words joined by hyphens ("quick-scan-camera-closed"). A plain
	// string: the app may report a kind this server has never heard of.
	Kind string `json:"kind"`
	// Detail is one line of what the app knew at that moment. It may be empty.
	Detail string `json:"detail"`
}
