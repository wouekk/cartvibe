package recipeimport

import (
	"fmt"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func dec(s string) *decimal.Decimal {
	d := decimal.RequireFromString(s)
	return &d
}

func existing(id uint, name, amount, unit, quantity string, checked bool) ExistingItem {
	item := ExistingItem{ID: id, Name: name, Unit: unit, Quantity: quantity, Checked: checked}
	if amount != "" {
		item.Amount = dec(amount)
	}
	return item
}

func in(name, amount, unit string) Incoming {
	row := Incoming{Name: name, Unit: unit}
	if amount != "" {
		row.Amount = dec(amount)
	}
	return row
}

// describe renders an op compactly: "update#3 amount=1.5 unit=kg" / "insert Mleko text=2 szklanki" / "revive#2 ...".
func describe(op Op) string {
	kind := map[OpKind]string{OpInsert: "insert", OpUpdate: "update", OpRevive: "revive"}[op.Kind]
	who := fmt.Sprintf("#%d", op.ID)
	if op.Kind == OpInsert {
		who = " " + op.Name
	}
	if op.NoChange {
		return kind + who + " nochange"
	}
	parts := []string{}
	if op.Stored.Amount != nil {
		parts = append(parts, "amount="+op.Stored.Amount.String())
	}
	if op.Stored.Unit != "" {
		parts = append(parts, "unit="+op.Stored.Unit)
	}
	if op.Stored.Quantity != "" {
		parts = append(parts, "text="+op.Stored.Quantity)
	}
	return strings.TrimSpace(kind + who + " " + strings.Join(parts, " "))
}

func describeAll(ops []Op) string {
	out := make([]string, len(ops))
	for i, op := range ops {
		out[i] = describe(op)
	}
	return strings.Join(out, "; ")
}

func TestToStored(t *testing.T) {
	cases := []struct {
		amount, unit string
		want         string
	}{
		{"200", "g", "amount=200 unit=g"},
		{"1.5", "kg", "amount=1.5 unit=kg"},
		{"500", "ml", "amount=500 unit=ml"},
		{"2", "l", "amount=2 unit=l"},
		{"5", "dag", "amount=50 unit=g"},
		{"250", "mg", "amount=0.25 unit=g"},
		{"3", "cl", "amount=30 unit=ml"},
		{"2", "dl", "amount=200 unit=ml"},
		{"3", "", "amount=3"},
		{"3", "szt", "amount=3"},
		{"3", "Stück", "amount=3"},
		{"3", "pcs", "amount=3"},
		{"2", "szklanki", "text=2 szklanki"},
		{"1.5", "łyżeczka", "text=1.5 łyżeczka"},
		{"1", "Prise", "text=1 Prise"},
		{"2", "cuillères à soupe", "text=2 cuillères à soupe"},
		{"1", "cup", "text=1 cup"},
		{"0.33", "tsp", "text=0.33 tsp"},
		// out of the structured range falls back to text
		{"99999.9999", "g", "text=99999.9999 g"},
		{"100000", "g", "text=100000 g"},
	}
	for _, tc := range cases {
		t.Run(tc.amount+" "+tc.unit, func(t *testing.T) {
			got := strings.Join(strings.Fields(describe(Op{Kind: OpInsert, Name: "", Stored: ToStored(dec(tc.amount), tc.unit)})), " ")
			if got != "insert "+tc.want {
				t.Errorf("ToStored(%s, %q) = %q, want %q", tc.amount, tc.unit, got, "insert "+tc.want)
			}
		})
	}
	if s := ToStored(nil, "g"); s.Amount != nil || s.Unit != "" || s.Quantity != "" {
		t.Errorf("no amount must store nothing, got %+v", s)
	}
	long := strings.Repeat("x", 60)
	if s := ToStored(dec("2"), long); s.Quantity != "2" {
		t.Errorf("an over-long unit must not overflow the text column, got %q", s.Quantity)
	}
}

func TestPlanMergeUncheckedCompatibleSums(t *testing.T) {
	list := []ExistingItem{
		existing(1, "Mąka", "500", "g", "", false),
		existing(2, "Mleko", "1", "l", "", false),
		existing(3, "Jajka", "6", "pcs", "", false),
		existing(4, "Masło", "", "", "", false),
		existing(5, "Sól", "", "", "2 łyżeczki", false),
	}
	ops := PlanMerge(list, []Incoming{
		in("mąka", "1", "kg"),      // 500 g + 1 kg, existing unit wins
		in("MLEKO ", "250", "ml"),  // 1 l + 250 ml
		in("jajka", "4", ""),       // bare count onto a pcs row
		in("Masło", "200", "g"),    // the item names no quantity yet
		in("sól", "1", "łyżeczka"), // text quantities are re-read and summed
		in("Sól", "1", "łyżeczki"), // plural spelling folds in
	})
	want := "update#1 amount=1500 unit=g; " +
		"update#2 amount=1.25 unit=l; " +
		"update#3 amount=10 unit=pcs; " +
		"update#4 amount=200 unit=g; " +
		"update#5 text=3 łyżeczki; " +
		"update#5 text=4 łyżeczki"
	if got := describeAll(ops); got != want {
		t.Errorf("\n got  %s\n want %s", got, want)
	}
}

func TestPlanMergeUncheckedIncompatibleInsertsNewRow(t *testing.T) {
	list := []ExistingItem{
		existing(1, "Czosnek", "1", "", "", false),
		existing(2, "Masło", "100", "g", "", false),
	}
	ops := PlanMerge(list, []Incoming{
		in("czosnek", "2", "ząbki"),  // 1 (bare count) vs ząbki
		in("Masło", "1", "łyżka"),    // g vs łyżka
		in("masło", "1", "szklanka"), // a third unit: again its own row, folded with nothing
	})
	want := "insert czosnek text=2 ząbki; insert Masło text=1 łyżka; insert masło text=1 szklanka"
	if got := describeAll(ops); got != want {
		t.Errorf("\n got  %s\n want %s", got, want)
	}
}

func TestPlanMergeTriesEveryUncheckedRowOfThatName(t *testing.T) {
	list := []ExistingItem{
		existing(1, "Cebula", "", "", "2 szklanki", false),
		existing(2, "Cebula", "3", "", "", false),
	}
	ops := PlanMerge(list, []Incoming{in("cebula", "2", "szt")})
	if got, want := describeAll(ops), "update#2 amount=5"; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestPlanMergeCheckedItemIsRevivedAndReplaced(t *testing.T) {
	list := []ExistingItem{
		existing(1, "Cukier", "1", "kg", "", true),
		existing(2, "Sól", "", "", "2 łyżeczki", true),
	}
	ops := PlanMerge(list, []Incoming{
		in("cukier", "250", "g"), // replaced, not summed
		in("Sól", "", ""),        // no new quantity: the item keeps its own
	})
	want := "revive#1 amount=250 unit=g; revive#2 text=2 łyżeczki"
	if got := describeAll(ops); got != want {
		t.Errorf("\n got  %s\n want %s", got, want)
	}
}

func TestPlanMergeUncheckedBeatsChecked(t *testing.T) {
	list := []ExistingItem{
		existing(1, "Masło", "100", "g", "", true),
		existing(2, "Masło", "50", "g", "", false),
	}
	if got, want := describeAll(PlanMerge(list, []Incoming{in("masło", "100", "g")})), "update#2 amount=150 unit=g"; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
	// An unchecked row with an incompatible unit means a new row, not reviving the crossed-off one.
	if got, want := describeAll(PlanMerge(list, []Incoming{in("masło", "1", "łyżka")})), "insert masło text=1 łyżka"; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestPlanMergeRowWithoutQuantityOnAnUncheckedMatchIsANoOp(t *testing.T) {
	list := []ExistingItem{existing(1, "Sól", "", "", "", false)}
	if got, want := describeAll(PlanMerge(list, []Incoming{in("sól", "", "")})), "update#1 nochange"; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestPlanMergeNonAsciiNamesMatch(t *testing.T) {
	list := []ExistingItem{existing(1, "ŻUREK", "1", "", "", false)}
	if got, want := describeAll(PlanMerge(list, []Incoming{in("żurek", "2", "")})), "update#1 amount=3"; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestPlanMergeRowsFoldIntoEarlierInserts(t *testing.T) {
	ops := PlanMerge(nil, []Incoming{
		in("Mąka", "200", "g"),
		in("mąka", "300", "g"),
		in("Jajka", "2", ""),
		in("Masło", "", ""),
		in("masło", "100", "g"),
	})
	want := "insert Mąka amount=500 unit=g; insert Jajka amount=2; insert Masło amount=100 unit=g"
	if got := describeAll(ops); got != want {
		t.Errorf("\n got  %s\n want %s", got, want)
	}
}

func TestPlanMergeSumThatDoesNotFitInsertsInstead(t *testing.T) {
	list := []ExistingItem{existing(1, "Ryż", "99999", "g", "", false)}
	ops := PlanMerge(list, []Incoming{in("ryż", "5", "g")})
	if got, want := describeAll(ops), "insert ryż amount=5 unit=g"; got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestPlanMergeSkipsBlankNames(t *testing.T) {
	if ops := PlanMerge(nil, []Incoming{in("  ", "1", "")}); len(ops) != 0 {
		t.Errorf("got %v", ops)
	}
}
