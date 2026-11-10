package services

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// A provider given a schema drops every key the schema does not name, without a word. So the schemas must name
// exactly the keys the prompts ask for: these tests read the example answer out of each prompt and compare.

var exampleLine = regexp.MustCompile(`(?m)^\{"[a-zA-Z]+":.*\}$`)

// exampleKeys returns the keys of the example JSON object in a prompt, and of the first element of each array of
// objects in it, as "key" and "array[].key".
func exampleKeys(t *testing.T, example string) []string {
	t.Helper()
	var parsed map[string]any
	if err := json.Unmarshal([]byte(example), &parsed); err != nil {
		t.Fatalf("the prompt's example is not JSON: %v\n%s", err, example)
	}
	return keysOf("", parsed)
}

func keysOf(prefix string, object map[string]any) []string {
	keys := []string{}
	for key, value := range object {
		keys = append(keys, prefix+key)
		if list, ok := value.([]any); ok && len(list) > 0 {
			if element, ok := list[0].(map[string]any); ok {
				keys = append(keys, keysOf(prefix+key+"[].", element)...)
			}
		}
	}
	sort.Strings(keys)
	return keys
}

// schemaKeys returns the same list for a schema.
func schemaKeys(prefix string, schema map[string]any) []string {
	keys := []string{}
	properties, _ := schema["properties"].(map[string]any)
	for key, value := range properties {
		keys = append(keys, prefix+key)
		property, _ := value.(map[string]any)
		if items, ok := property["items"].(map[string]any); ok && items["type"] == "object" {
			keys = append(keys, schemaKeys(prefix+key+"[].", items)...)
		}
	}
	sort.Strings(keys)
	return keys
}

func TestTheReceiptSchemaNamesTheKeysTheReceiptPromptAsksFor(t *testing.T) {
	example := exampleLine.FindString(DefaultReceiptPrompt)
	if example == "" {
		t.Fatal("no example answer found in DefaultReceiptPrompt")
	}

	want := exampleKeys(t, example)
	got := schemaKeys("", receiptAnswerSchema(false).Schema)
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Errorf("the schema names %v, the prompt asks for %v", got, want)
	}
}

func TestTheProductSchemasNameTheKeysTheProductPromptsAskFor(t *testing.T) {
	example := exampleLine.FindString(productExtractionPromptTemplate)
	if example == "" {
		t.Fatal("no example answer found in productExtractionPromptTemplate")
	}
	want := exampleKeys(t, example)
	got := schemaKeys("", productAnswerSchema().Schema)
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Errorf("the product schema names %v, the prompt asks for %v", got, want)
	}

	// The quick scan's inline part asks for the same product line inside the receipt answer.
	inline := regexp.MustCompile(`(?m)^"products":(\[\{.*\}\])$`).FindStringSubmatch(inlineProductPromptTemplate)
	if inline == nil {
		t.Fatal("no example products found in inlineProductPromptTemplate")
	}
	wantInline := exampleKeys(t, `{"products":`+inline[1]+`}`)
	var gotInline []string
	for _, key := range schemaKeys("", receiptAnswerSchema(true).Schema) {
		if strings.HasPrefix(key, "products") {
			gotInline = append(gotInline, key)
		}
	}
	if strings.Join(gotInline, " ") != strings.Join(wantInline, " ") {
		t.Errorf("the inline products are %v in the schema, %v in the prompt", gotInline, wantInline)
	}

	if !promptAsksForProducts("x"+inlineProductPromptTemplate) || promptAsksForProducts(DefaultReceiptPrompt) {
		t.Error("promptAsksForProducts must tell the two receipt prompts apart")
	}
}

// What every provider takes: objects closed with additionalProperties false, and no key required that the prompts
// allow to be left out.
func TestTheSchemasStayWithinWhatEveryProviderTakes(t *testing.T) {
	var check func(path string, schema map[string]any)
	check = func(path string, schema map[string]any) {
		switch schema["type"] {
		case "object":
			if schema["additionalProperties"] != false {
				t.Errorf("%s: an object must set additionalProperties to false", path)
			}
			properties, _ := schema["properties"].(map[string]any)
			for key, value := range properties {
				check(path+"."+key, value.(map[string]any))
			}
		case "array":
			check(path+"[]", schema["items"].(map[string]any))
		case "string", "number", "integer":
		default:
			t.Errorf("%s: type %v is not one every provider takes", path, schema["type"])
		}
	}
	check("receipt", receiptAnswerSchema(true).Schema)
	check("products", productAnswerSchema().Schema)

	if required := receiptAnswerSchema(true).Schema["required"].([]string); len(required) != 1 || required[0] != "name" {
		t.Errorf("only the name is required of a receipt answer, got %v", required)
	}
}
