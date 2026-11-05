package models

// GroupIcons are the icons a household may show (names <app-icon> draws; the desktop's GROUP_ICONS keeps the same list).
// "" is no icon: the household's initial shows, as before.
var GroupIcons = []string{
	"home", "add_home", "apartment", "group", "favorite", "child_care", "dog", "cat", "pets", "directions_car",
	"flight", "shopping_cart", "restaurant", "local_cafe", "work", "school", "park", "sunny", "star",
}

// GroupColors are the colours a household may wear (the --household-<name> tokens; the desktop's GROUP_COLORS keeps the
// same list and order: the neutrals, then round the colour wheel). "" is the default look.
var GroupColors = []string{
	"zinc", "slate", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo",
	"violet", "purple", "fuchsia", "pink", "rose",
}

// IsGroupIcon reports whether value is "" or one of GroupIcons.
func IsGroupIcon(value string) bool {
	return value == "" || contains(GroupIcons, value)
}

// IsGroupColor reports whether value is "" or one of GroupColors.
func IsGroupColor(value string) bool {
	return value == "" || contains(GroupColors, value)
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
