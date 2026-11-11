package routers

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// swagger.yml is written by hand, and so are the Go types the API reads and answers with. Nothing made the two
// agree: a field added to a Go type reached every client without being in the contract, and a property the
// contract promised could stop being sent. This test compares them by name: for every object schema, the
// properties swagger.yml lists and the JSON fields of the Go type behind it must be the same set.
//
// What it does not check: a property's type, which properties are required, and Go types that go on the wire
// without a schema of their own. The routes are compared in contract_test.go.
//
// A difference is either fixed (in the Go type or in swagger.yml) or listed below with its reason. An entry that
// is no longer needed fails the test too, so the lists only ever hold what is true today.

// contractGoTypes names the Go type behind a schema where the two are not called the same ("package.Type").
var contractGoTypes = map[string]string{
	"AvatarResponse":                 "handlers.avatarResponse",
	"BackupImportJob":                "backup.JobView",
	"BackupImportPerson":             "backup.PreviewPerson",
	"BackupImportPreview":            "backup.Preview",
	"BackupImportStartCommand":       "handlers.backupImportStartCommand",
	"CurrencyRate":                   "structs.ExchangeRateView",
	"CurrencyRateTable":              "structs.ExchangeRatesView",
	"ImportShoppingListRecipeResult": "services.RecipeImportResult",
	"PermissionDescriptor":           "permissions.Descriptor",
	"PushSubscriptionCommand":        "commands.UpsertPushSubscriptionCommand",
	"ReportPreviewResponse":          "services.ReportPreview",
	"Role":                           "structs.RoleView",
	"ShopLogo":                       "handlers.shopLogoSummary",
	"ShopLogoStatus":                 "shoplogos.Status",
}

// schemasWithoutGoType are the schemas no Go struct stands behind, and why.
var schemasWithoutGoType = map[string]string{
	"BackupImportUploadCommand":                         "a multipart form with one file, read from the request by the handler",
	"ReceiptFileUploadCommand":                          "a multipart form (file, receiptId), read from the request by the handler",
	"UploadAvatarCommand":                               "a multipart form with one file, read from the request by the handler",
	"UpdateDashboardLayoutCommand":                      "read into a struct declared inside the handler (handlers/dashboard_layout.go)",
	"InternalErrorResponse":                             "written as a map by utils.WriteCustomErrorResponse, the one shape every error has",
	"LogoutCommand":                                     "the refresh token is taken from the cookie, or from the body through structs.TokenPair, which also carries the access token",
	"EncodedImage":                                      "the handler answers with a one-field struct of its own (handlers/receipt_image.go)",
	"CheckReceiptProcessingSettingsConnectivityCommand": "the settings' own command and an id, read by the handler as either",
}

// contractFieldsEverywhere are differences that hold for every schema, and why.
var contractFieldsEverywhere = map[string]string{
	"createdByString": "every model carries it through BaseModel (a name for rows a job created); the contract lists it only where the app shows it",
}

// contractDifferences are the known differences, schema by schema: the property or field, and why it differs.
// "contract" entries are promised by swagger.yml and not sent; "go" entries are JSON fields the contract leaves out.
var contractDifferences = map[string]struct{ contract, goType map[string]string }{
	"Claims": {
		contract: map[string]string{
			"aud": "from the JWT library's RegisteredClaims, which the Go type embeds",
			"exp": "from the JWT library's RegisteredClaims, which the Go type embeds",
			"iat": "from the JWT library's RegisteredClaims, which the Go type embeds",
			"iss": "from the JWT library's RegisteredClaims, which the Go type embeds",
			"jti": "from the JWT library's RegisteredClaims, which the Go type embeds",
			"nbf": "from the JWT library's RegisteredClaims, which the Go type embeds",
			"sub": "from the JWT library's RegisteredClaims, which the Go type embeds",
		},
		goType: map[string]string{
			"tokenType": "tells an access token from a refresh token for the server; no client reads it",
		},
	},
	"CreateReceiptWithFilesCommand": {
		contract: map[string]string{
			"files":   "a multipart form: the handler reads the part by this name, the struct's fields carry no tag",
			"receipt": "a multipart form: the handler reads the part by this name, the struct's fields carry no tag",
		},
		goType: map[string]string{
			"Files":   "a multipart form: the field holds the parts named files",
			"Receipt": "a multipart form: the field holds the part named receipt",
		},
	},
	"QuickScanCommand": {
		contract: map[string]string{
			"files":         "a multipart form read part by part; the struct's tags are not what parses it",
			"groupIds":      "a multipart form read part by part; the struct's tags are not what parses it",
			"paidByUserIds": "a multipart form read part by part; the struct's tags are not what parses it",
			"statuses":      "a multipart form read part by part; the struct's tags are not what parses it",
		},
		goType: map[string]string{
			"file":         "the tag of the field that holds the parts named files",
			"fileHeader":   "the headers of those parts, filled by the server",
			"groupId":      "the tag of the field that holds the parts named groupIds",
			"paidByUserId": "the tag of the field that holds the parts named paidByUserIds",
			"status":       "the tag of the field that holds the parts named statuses",
		},
	},
	"FileData": {
		contract: map[string]string{
			"imageData": "inherited from upstream: a file's bytes travel through /receiptImage/{id}/file, never inside this object",
		},
	},
	"GroupMember": {
		goType: map[string]string{
			"groupRoleDefinition": "set only where a query loads the role for the server's own permission checks, and left out when empty; the app reads groupRoleId",
		},
	},
	"ReceiptProcessingSettings": {
		contract: map[string]string{
			"key": "the provider key is written through this object and never sent back (json:\"-\")",
		},
	},
	"SystemTask": {
		goType: map[string]string{
			"associatedSystemTask":   "the parent task, loaded for the server; the app reads childSystemTasks",
			"associatedSystemTaskId": "the parent task's id; the app reads childSystemTasks",
			"jobId":                  "the job behind the task, for the server's rerun and source-file lookups",
		},
	},
	"UpsertReceiptCommand": {
		goType: map[string]string{
			"currency":         "filled from the AI's read and the import, never by a client: the server works the conversion out",
			"exchangeRate":     "filled from the AI's read and the import, never by a client: the server works the conversion out",
			"originalAmount":   "filled from the AI's read and the import, never by a client: the server works the conversion out",
			"originalCurrency": "filled from the AI's read and the import, never by a client: the server works the conversion out",
		},
	},
	"User": {
		contract: map[string]string{
			"password": "the Go field has no tag; Go reads a JSON key whatever its case, so the body's password reaches it",
			"username": "the Go field has no tag; Go reads a JSON key whatever its case, so the body's username reaches it",
		},
		goType: map[string]string{
			"Password": "the untagged field behind the contract's password",
			"Username": "the untagged field behind the contract's username",
			"appRole":  "set only where a query loads the role, and left out when empty; the app reads appRoleId",
		},
	},
	"UserView": {
		contract: map[string]string{
			"createdBy": "promised by the contract and never sent: a person is not created by another row",
		},
	},
}

// contractSchema is one entry of components.schemas in swagger.yml, as far as this test reads it.
type contractSchema struct {
	Properties map[string]yaml.Node `yaml:"properties"`
	AllOf      []struct {
		Ref        string               `yaml:"$ref"`
		Properties map[string]yaml.Node `yaml:"properties"`
	} `yaml:"allOf"`
	Enum []yaml.Node `yaml:"enum"`
}

// contractProperties reads swagger.yml and returns, for every schema that is an object, the names of its
// properties (those of the schemas it is composed of with allOf included).
func contractProperties(t *testing.T) map[string]map[string]bool {
	t.Helper()
	content, err := os.ReadFile("../../swagger.yml")
	if err != nil {
		t.Fatal(err)
	}
	var contract struct {
		Components struct {
			Schemas map[string]contractSchema `yaml:"schemas"`
		} `yaml:"components"`
	}
	if err := yaml.Unmarshal(content, &contract); err != nil {
		t.Fatal(err)
	}

	schemas := contract.Components.Schemas
	var propertiesOf func(name string, seen map[string]bool) map[string]bool
	propertiesOf = func(name string, seen map[string]bool) map[string]bool {
		names := map[string]bool{}
		if seen[name] {
			return names
		}
		seen[name] = true
		schema := schemas[name]
		for property := range schema.Properties {
			names[property] = true
		}
		for _, part := range schema.AllOf {
			for property := range part.Properties {
				names[property] = true
			}
			if part.Ref != "" {
				for property := range propertiesOf(strings.TrimPrefix(part.Ref, "#/components/schemas/"), seen) {
					names[property] = true
				}
			}
		}
		return names
	}

	objects := map[string]map[string]bool{}
	for name, schema := range schemas {
		if len(schema.Enum) > 0 {
			continue
		}
		properties := propertiesOf(name, map[string]bool{})
		if len(properties) > 0 {
			objects[name] = properties
		}
	}
	return objects
}

// goStruct is a struct type as the source declares it: the JSON names of its fields and the types it embeds.
type goStruct struct {
	pkg      string
	name     string
	fields   map[string]bool
	embedded []string
}

// goStructs parses the API's packages (tests left out) and returns every struct type by name. A name declared
// in more than one package keeps every declaration.
func goStructs(t *testing.T) map[string][]goStruct {
	t.Helper()
	found := map[string][]goStruct{}
	fileSet := token.NewFileSet()

	err := filepath.WalkDir("..", func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(fileSet, path, nil, parser.SkipObjectResolution)
		if err != nil {
			return err
		}
		for _, declaration := range file.Decls {
			general, ok := declaration.(*ast.GenDecl)
			if !ok || general.Tok != token.TYPE {
				continue
			}
			for _, spec := range general.Specs {
				typeSpec := spec.(*ast.TypeSpec)
				structType, ok := typeSpec.Type.(*ast.StructType)
				if !ok {
					continue
				}
				read := readGoStruct(file.Name.Name, structType)
				read.name = typeSpec.Name.Name
				found[typeSpec.Name.Name] = append(found[typeSpec.Name.Name], read)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return found
}

func readGoStruct(pkg string, structType *ast.StructType) goStruct {
	read := goStruct{pkg: pkg, fields: map[string]bool{}}
	for _, field := range structType.Fields.List {
		tag := ""
		if field.Tag != nil {
			tag = reflect.StructTag(strings.Trim(field.Tag.Value, "`")).Get("json")
		}
		name, _, _ := strings.Cut(tag, ",")

		if len(field.Names) == 0 {
			// An embedded type: its fields are this type's own on the contract, unless a tag names it.
			if name == "" {
				read.embedded = append(read.embedded, embeddedTypeName(field.Type))
				continue
			}
			if name != "-" {
				read.fields[name] = true
			}
			continue
		}
		for _, identifier := range field.Names {
			if !identifier.IsExported() || name == "-" {
				continue
			}
			if name != "" {
				read.fields[name] = true
			} else {
				read.fields[identifier.Name] = true
			}
		}
	}
	return read
}

func embeddedTypeName(expression ast.Expr) string {
	switch typed := expression.(type) {
	case *ast.StarExpr:
		return embeddedTypeName(typed.X)
	case *ast.SelectorExpr:
		return typed.Sel.Name
	case *ast.Ident:
		return typed.Name
	}
	return ""
}

// jsonFields are a struct's JSON names with those of the types it embeds.
func jsonFields(structs map[string][]goStruct, declared goStruct, seen map[string]bool) map[string]bool {
	names := map[string]bool{}
	for name := range declared.fields {
		names[name] = true
	}
	for _, embedded := range declared.embedded {
		if seen[embedded] || len(structs[embedded]) == 0 {
			continue
		}
		seen[embedded] = true
		for name := range jsonFields(structs, structs[embedded][0], seen) {
			names[name] = true
		}
	}
	return names
}

func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// goTypesBehind returns the Go struct or structs behind a schema: the one contractGoTypes names, else every struct
// declared under the schema's own name (two packages may each have one, and both must agree with the contract).
func goTypesBehind(schema string, structs map[string][]goStruct) []goStruct {
	if qualified, mapped := contractGoTypes[schema]; mapped {
		pkg, name, _ := strings.Cut(qualified, ".")
		for _, declared := range structs[name] {
			if declared.pkg == pkg {
				return []goStruct{declared}
			}
		}
		return nil
	}
	return structs[schema]
}

func TestTheContractAndTheGoTypesNameTheSameFields(t *testing.T) {
	schemas := contractProperties(t)
	structs := goStructs(t)

	var problems []string
	used := map[string]bool{}
	note := func(schema string, side string, field string) bool {
		known := contractDifferences[schema].contract
		if side == "go" {
			known = contractDifferences[schema].goType
		}
		if known[field] != "" {
			used[schema+" "+side+" "+field] = true
			return true
		}
		return false
	}

	for _, schema := range sortedKeys(keysOf(schemas)) {
		declarations := goTypesBehind(schema, structs)
		if len(declarations) == 0 {
			if schemasWithoutGoType[schema] == "" {
				problems = append(problems, schema+": no Go struct of this name. Name its type in contractGoTypes, or say in schemasWithoutGoType why there is none")
			}
			continue
		}
		if schemasWithoutGoType[schema] != "" {
			problems = append(problems, schema+": listed in schemasWithoutGoType, but a Go struct of this name exists now: drop the entry")
		}

		for _, declared := range declarations {
			fields := jsonFields(structs, declared, map[string]bool{})
			where := schema + " (" + declared.pkg + "." + declared.name + ")"
			for _, property := range sortedKeys(schemas[schema]) {
				if fields[property] || contractFieldsEverywhere[property] != "" || note(schema, "contract", property) {
					continue
				}
				problems = append(problems, where+": swagger.yml has \""+property+"\", the Go type has no such JSON field")
			}
			for _, field := range sortedKeys(fields) {
				if schemas[schema][field] || contractFieldsEverywhere[field] != "" || note(schema, "go", field) {
					continue
				}
				problems = append(problems, where+": the Go type has the JSON field \""+field+"\", swagger.yml does not list it")
			}
		}
	}

	// Every entry of the lists must still be needed.
	for schema, qualified := range contractGoTypes {
		if schemas[schema] == nil {
			problems = append(problems, "contractGoTypes: "+schema+" is not an object schema of swagger.yml any more: drop the entry")
		} else if len(goTypesBehind(schema, structs)) == 0 {
			problems = append(problems, "contractGoTypes: "+schema+" names "+qualified+", which is not declared")
		}
	}
	for schema := range schemasWithoutGoType {
		if schemas[schema] == nil {
			problems = append(problems, "schemasWithoutGoType: "+schema+" is not an object schema of swagger.yml any more: drop the entry")
		}
	}
	for schema, differences := range contractDifferences {
		for field := range differences.contract {
			if !used[schema+" contract "+field] {
				problems = append(problems, "contractDifferences: "+schema+"."+field+" (contract) no longer differs: drop the entry")
			}
		}
		for field := range differences.goType {
			if !used[schema+" go "+field] {
				problems = append(problems, "contractDifferences: "+schema+"."+field+" (go) no longer differs: drop the entry")
			}
		}
	}

	sort.Strings(problems)
	if len(problems) > 0 {
		t.Errorf("swagger.yml and the Go types disagree. Change the one that is wrong, or record the difference with its reason in contract_schemas_test.go:\n  %s",
			strings.Join(problems, "\n  "))
	}
}

func keysOf(schemas map[string]map[string]bool) map[string]bool {
	names := map[string]bool{}
	for name := range schemas {
		names[name] = true
	}
	return names
}

// The comparison reads Go source, so its reading is tested on its own: tags, untagged and unexported fields,
// "-", options after a comma, and embedded types.
func TestReadGoStruct(t *testing.T) {
	// A struct tag is written between backticks, which a raw string cannot hold: "TICK" stands for one.
	source := strings.ReplaceAll(`package sample

type Base struct {
	ID        uint   TICKjson:"id"TICK
	CreatedAt string TICKjson:"createdAt"TICK
}

type Sample struct {
	Base
	Name     string  TICKgorm:"not null" json:"name"TICK
	Optional *string TICKjson:"optional,omitempty"TICK
	Hidden   string  TICKjson:"-"TICK
	Untagged string
	private  string
	A, B     int
}
`, "TICK", "`")
	file, err := parser.ParseFile(token.NewFileSet(), "sample.go", source, parser.SkipObjectResolution)
	if err != nil {
		t.Fatal(err)
	}
	structs := map[string][]goStruct{}
	for _, declaration := range file.Decls {
		for _, spec := range declaration.(*ast.GenDecl).Specs {
			typeSpec := spec.(*ast.TypeSpec)
			structs[typeSpec.Name.Name] = []goStruct{readGoStruct("sample", typeSpec.Type.(*ast.StructType))}
		}
	}

	got := sortedKeys(jsonFields(structs, structs["Sample"][0], map[string]bool{}))
	want := []string{"A", "B", "Untagged", "createdAt", "id", "name", "optional"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("read %v, want %v", got, want)
	}
}
