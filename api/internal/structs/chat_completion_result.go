package structs

type ChatCompletionResult struct {
	Response    string `json:"response"`
	RawResponse string `json:"raw_response"`

	// What the provider counted for the call, 0 when it said nothing: the tokens sent and the tokens written
	// (a model's thinking included, where the provider bills it as output).
	InputTokens  int64 `json:"-"`
	OutputTokens int64 `json:"-"`
}
