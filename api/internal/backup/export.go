package backup

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"

	"gorm.io/gorm"
)

// Options of one export.
type Options struct {
	IncludeFiles bool
	AppVersion   string
	Now          time.Time
}

// Snapshot is the household read in one transaction: every table as CSV bytes and the list of
// files to stream after the transaction has closed (a read transaction holds SQLite's write lock,
// because the connection opens with _txlock=immediate, so it must stay short).
type Snapshot struct {
	Manifest    Manifest
	tables      []snapshotTable
	attachments []attachment
}

type snapshotTable struct {
	name    string
	rows    int
	content []byte
}

type attachment struct {
	entryName string
	diskPath  string
	bytes     int64
}

// TableCount is one table's row count in a snapshot.
type TableCount struct {
	Name  string
	Count int
}

// Counts lists the row count of every table, in export order.
func (snapshot *Snapshot) Counts() []TableCount {
	counts := make([]TableCount, 0, len(snapshot.tables))
	for _, table := range snapshot.tables {
		counts = append(counts, TableCount{Name: table.name, Count: table.rows})
	}
	return counts
}

// FileTotals are the number of photos and PDFs and their recorded size.
func (snapshot *Snapshot) FileTotals() (int, int64) {
	var total int64
	for _, file := range snapshot.attachments {
		total += file.bytes
	}
	return len(snapshot.attachments), total
}

type exportState struct {
	tx          *gorm.DB
	options     Options
	attachments []attachment
}

type tableSpec struct {
	name    string
	columns []string
	write   func(state *exportState, table *tableWriter) error
}

// TakeSnapshot reads the whole household, never the secrets (password hashes, AI, Logo.dev and OIDC
// keys, tokens, push subscriptions) and never the ephemeral rows (notifications, system tasks,
// sweep state, warranty reminders). Paid-by and member visibility are not applied: the caller is an
// admin holding app.backup.export.
func TakeSnapshot(db *gorm.DB, options Options) (*Snapshot, error) {
	exportId, err := newExportId()
	if err != nil {
		return nil, err
	}

	snapshot := &Snapshot{
		Manifest: Manifest{
			Format:        FormatName,
			FormatVersion: FormatVersion,
			AppVersion:    options.AppVersion,
			ExportedAt:    formatInstant(options.Now),
			ExportId:      exportId,
			IncludesFiles: options.IncludeFiles,
			AllGroupIds:   []uint{},
			Entries:       []ManifestEntry{},
			MissingFiles:  []string{},
		},
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		settings, err := repositories.NewSystemSettingsRepository(tx).GetSystemSettings()
		if err != nil {
			return err
		}
		snapshot.Manifest.Household = HouseholdSetting{
			CurrencyDisplay:              settings.CurrencyDisplay,
			CurrencyCode:                 utils.MainCurrencyCode(settings.CurrencyDisplay),
			CurrencyThousandthsSeparator: string(settings.CurrencyThousandthsSeparator),
			CurrencyDecimalSeparator:     string(settings.CurrencyDecimalSeparator),
			CurrencySymbolPosition:       string(settings.CurrencySymbolPosition),
			CurrencyHideDecimalPlaces:    settings.CurrencyHideDecimalPlaces,
			TimeZone:                     settings.TimeZone,
			DateFormat:                   settings.DateFormat,
		}

		if err := tx.Model(models.Group{}).Where("is_all_group = ?", true).Order("id").Pluck("id", &snapshot.Manifest.AllGroupIds).Error; err != nil {
			return err
		}

		state := &exportState{tx: tx, options: options}
		for _, spec := range tableSpecs {
			table, err := newTableWriter(spec.columns)
			if err != nil {
				return err
			}
			if err := spec.write(state, table); err != nil {
				return err
			}
			content, err := table.bytes()
			if err != nil {
				return err
			}
			snapshot.tables = append(snapshot.tables, snapshotTable{name: spec.name, rows: table.rows, content: content})
		}
		snapshot.attachments = state.attachments

		return nil
	})
	if err != nil {
		return nil, err
	}

	return snapshot, nil
}

// WriteZip streams the snapshot as a ZIP: the tables, then the files, then manifest.json with the
// size and SHA-256 of every entry. A file that cannot be read any more (deleted since the snapshot)
// is listed under missingFiles instead of failing the export.
func (snapshot *Snapshot) WriteZip(writer io.Writer) error {
	archive := zip.NewWriter(writer)
	manifest := snapshot.Manifest

	for _, table := range snapshot.tables {
		rows := table.rows
		entry, err := writeEntry(archive, tableEntryName(table.name), table.content, zip.Deflate)
		if err != nil {
			return err
		}
		entry.Kind = EntryKindTable
		entry.Rows = &rows
		manifest.Entries = append(manifest.Entries, entry)
	}

	for _, file := range snapshot.attachments {
		content, err := utils.ReadDataFile(file.diskPath)
		if err != nil {
			manifest.MissingFiles = append(manifest.MissingFiles, file.entryName)
			continue
		}
		// Photos and PDFs are compressed already.
		entry, err := writeEntry(archive, file.entryName, content, zip.Store)
		if err != nil {
			return err
		}
		entry.Kind = EntryKindFile
		manifest.Entries = append(manifest.Entries, entry)
	}

	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if _, err := writeEntry(archive, ManifestName, manifestBytes, zip.Deflate); err != nil {
		return err
	}

	return archive.Close()
}

func writeEntry(archive *zip.Writer, name string, content []byte, method uint16) (ManifestEntry, error) {
	header := &zip.FileHeader{Name: name, Method: method}
	header.SetMode(0o644)

	entryWriter, err := archive.CreateHeader(header)
	if err != nil {
		return ManifestEntry{}, err
	}
	if _, err := entryWriter.Write(content); err != nil {
		return ManifestEntry{}, err
	}

	sum := sha256.Sum256(content)
	return ManifestEntry{Name: name, Bytes: int64(len(content)), Sha256: hex.EncodeToString(sum[:])}, nil
}

// batchSize bounds memory while a large table is read.
const batchSize = 500

func eachInBatches[T any](query *gorm.DB, emit func(row T) error) error {
	var batch []T
	var emitErr error
	result := query.FindInBatches(&batch, batchSize, func(_ *gorm.DB, _ int) error {
		for _, row := range batch {
			if err := emit(row); err != nil {
				emitErr = err
				return err
			}
		}
		return nil
	})
	if emitErr != nil {
		return emitErr
	}
	return result.Error
}

// tableSpecs is the export, in dependency order: a table only refers to tables above it.
var tableSpecs = []tableSpec{
	{
		name:    "users",
		columns: []string{"id", "username", "display_name", "default_avatar_color", "is_dummy_user", "app_role", "created_at"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.User{}).Preload("AppRole"), func(user models.User) error {
				role := ""
				if user.AppRole != nil {
					role = user.AppRole.Name
				}
				return table.write(formatUint(user.ID), user.Username, user.DisplayName, user.DefaultAvatarColor,
					formatBool(user.IsDummyUser), role, formatInstant(user.CreatedAt))
			})
		},
	},
	{
		name:    "groups",
		columns: []string{"id", "name", "is_default_group", "status", "created_at", "created_by"},
		write: func(state *exportState, table *tableWriter) error {
			query := state.tx.Model(models.Group{}).Where("is_all_group = ?", false)
			return eachInBatches(query, func(group models.Group) error {
				return table.write(formatUint(group.ID), group.Name, formatBool(group.IsDefaultGroup), string(group.Status),
					formatInstant(group.CreatedAt), formatUintPtr(group.CreatedBy))
			})
		},
	},
	{
		name:    "group_members",
		columns: []string{"user_id", "group_id", "group_role", "created_at"},
		write: func(state *exportState, table *tableWriter) error {
			var members []models.GroupMember
			err := state.tx.Model(models.GroupMember{}).
				Joins("JOIN groups ON groups.id = group_members.group_id AND groups.is_all_group = ?", false).
				Preload("GroupRoleDefinition").
				Order("group_members.group_id, group_members.user_id").
				Find(&members).Error
			if err != nil {
				return err
			}
			for _, member := range members {
				role := ""
				if member.GroupRoleDefinition != nil {
					role = member.GroupRoleDefinition.Name
				}
				if err := table.write(formatUint(member.UserID), formatUint(member.GroupID), role, formatInstant(member.CreatedAt)); err != nil {
					return err
				}
			}
			return nil
		},
	},
	{
		name:    "categories",
		columns: []string{"id", "name", "description", "skipped", "aliases", "created_at"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.Category{}), func(category models.Category) error {
				return table.write(formatUint(category.ID), category.Name, category.Description, formatBool(category.Skipped),
					category.Aliases, formatInstant(category.CreatedAt))
			})
		},
	},
	{
		name:    "tags",
		columns: []string{"id", "name", "description", "show_on_dashboard", "created_at"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.Tag{}), func(tag models.Tag) error {
				return table.write(formatUint(tag.ID), tag.Name, tag.Description, formatBool(tag.ShowOnDashboard), formatInstant(tag.CreatedAt))
			})
		},
	},
	{
		name: "receipts",
		columns: []string{"id", "group_id", "name", "shop_name", "date", "amount", "original_amount", "original_currency",
			"exchange_rate", "warranty_until", "status", "resolved_date", "paid_by_user_id", "note", "created_at", "created_by"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.Receipt{}), func(receipt models.Receipt) error {
				return table.write(formatUint(receipt.ID), formatUint(receipt.GroupId), receipt.Name, receipt.ShopName,
					formatDay(receipt.Date), receipt.Amount.String(), formatDecimalPtr(receipt.OriginalAmount),
					receipt.OriginalCurrency, formatDecimalPtr(receipt.ExchangeRate), formatStringPtr(receipt.WarrantyUntil),
					string(receipt.Status), formatInstantPtr(receipt.ResolvedDate), formatUint(receipt.PaidByUserID),
					receipt.Note, formatInstant(receipt.CreatedAt), formatUintPtr(receipt.CreatedBy))
			})
		},
	},
	joinTableSpec("receipt_categories", "receipt_id", "category_id"),
	joinTableSpec("receipt_tags", "receipt_id", "tag_id"),
	{
		name: "receipt_products",
		columns: []string{"id", "receipt_id", "position", "name", "display_name", "quantity", "amount", "category_id",
			"category_overridden", "planned", "matched_shopping_list_item_id", "health", "food_group", "seasonality",
			"classified_at", "classification_overridden", "created_at"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.ReceiptProduct{}), func(product models.ReceiptProduct) error {
				return table.write(formatUint(product.ID), formatUint(product.ReceiptId), formatIntPtr(&product.Position),
					product.Name, product.DisplayName, product.Quantity, formatDecimalPtr(product.Amount),
					formatUintPtr(product.CategoryId), formatBool(product.CategoryOverridden), formatBoolPtr(product.Planned),
					formatUintPtr(product.MatchedShoppingListItemId), product.Health, product.FoodGroup, product.Seasonality,
					formatInstantPtr(product.ClassifiedAt), formatBool(product.ClassificationOverridden),
					formatInstant(product.CreatedAt))
			})
		},
	},
	joinTableSpec("receipt_product_tags", "receipt_product_id", "tag_id"),
	{
		name:    "files",
		columns: []string{"id", "receipt_id", "name", "file_type", "size", "file", "created_at"},
		write: func(state *exportState, table *tableWriter) error {
			fileRepository := repositories.NewFileRepository(state.tx)
			return eachInBatches(state.tx.Model(models.FileData{}), func(file models.FileData) error {
				entryName := ""
				if state.options.IncludeFiles {
					path, err := fileRepository.BuildFilePath(formatUint(file.ReceiptId), formatUint(file.ID))
					if err != nil {
						return err
					}
					entryName = receiptFileEntryName(file.ID)
					state.attachments = append(state.attachments, attachment{entryName: entryName, diskPath: path, bytes: int64(file.Size)})
				}
				return table.write(formatUint(file.ID), formatUint(file.ReceiptId), file.Name, file.FileType,
					formatUint(file.Size), entryName, formatInstant(file.CreatedAt))
			})
		},
	},
	{
		name:    "shopping_lists",
		columns: []string{"id", "group_id", "name", "created_at", "created_by"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.ShoppingList{}), func(list models.ShoppingList) error {
				return table.write(formatUint(list.ID), formatUint(list.GroupId), list.Name, formatInstant(list.CreatedAt), formatUintPtr(list.CreatedBy))
			})
		},
	},
	{
		name: "shopping_list_items",
		columns: []string{"id", "shopping_list_id", "name", "amount", "unit", "quantity", "note", "is_checked", "checked_at",
			"checked_by_user_id", "health", "food_group", "seasonality", "classified_at", "classification_overridden",
			"created_at", "created_by"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.ShoppingListItem{}), func(item models.ShoppingListItem) error {
				return table.write(formatUint(item.ID), formatUint(item.ShoppingListId), item.Name, formatDecimalPtr(item.Amount),
					item.Unit, item.Quantity, item.Note, formatBool(item.IsChecked), formatInstantPtr(item.CheckedAt),
					formatUintPtr(item.CheckedByUserId), item.Health, item.FoodGroup, item.Seasonality,
					formatInstantPtr(item.ClassifiedAt), formatBool(item.ClassificationOverridden),
					formatInstant(item.CreatedAt), formatUintPtr(item.CreatedBy))
			})
		},
	},
	{
		// photo_path is a path on the exporting server; the photo itself travels as files/trips/<id>.
		name:    "shopping_trips",
		columns: []string{"id", "shopping_list_id", "receipt_id", "status", "planned_items", "photo_name", "photo", "last_error", "created_at"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.ShoppingTrip{}), func(trip models.ShoppingTrip) error {
				entryName := ""
				if state.options.IncludeFiles && trip.PhotoPath != "" {
					entryName = tripPhotoEntryName(trip.ID)
					size, err := utils.DataFileSize(trip.PhotoPath)
					if err != nil && !errors.Is(err, utils.ErrDataFileMissing) {
						return err
					}
					state.attachments = append(state.attachments, attachment{entryName: entryName, diskPath: trip.PhotoPath, bytes: size})
				}
				return table.write(formatUint(trip.ID), formatUint(trip.ShoppingListId), formatUintPtr(trip.ReceiptId),
					string(trip.Status), trip.PlannedItems, trip.PhotoName, entryName, trip.LastError, formatInstant(trip.CreatedAt))
			})
		},
	},
	{
		name:    "classification_overrides",
		columns: []string{"group_id", "normalized_name", "health"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.ProductClassificationOverride{}), func(override models.ProductClassificationOverride) error {
				return table.write(formatUint(override.GroupId), override.NormalizedName, override.Health)
			})
		},
	},
	{
		name:    "exchange_rates",
		columns: []string{"code", "rate"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.ExchangeRate{}), func(rate models.ExchangeRate) error {
				return table.write(rate.Code, formatDecimalPtr(rate.Rate))
			})
		},
	},
	{
		// configuration is the stored report request JSON verbatim; its group, category, tag and
		// paid-by ids are this server's and are rewritten on import.
		name:    "report_templates",
		columns: []string{"id", "name", "configuration", "configuration_version", "created_at", "created_by"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.ReportTemplate{}), func(template models.ReportTemplate) error {
				return table.write(formatUint(template.ID), template.Name, string(template.Configuration),
					formatIntPtr(&template.ConfigurationVersion), formatInstant(template.CreatedAt), formatUintPtr(template.CreatedBy))
			})
		},
	},
	joinTableSpec("report_template_groups", "report_template_id", "group_id"),
	{
		name: "user_preferences",
		columns: []string{"user_id", "quick_scan_default_group_id", "quick_scan_default_paid_by_id", "quick_scan_default_status",
			"close_chip_select_on_select", "monthly_spending_goal", "language", "ai_language", "region", "onboarding_pending",
			"warranty_period_years", "warranty_reminder_lead_days"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.UserPreferences{}), func(preferences models.UserPreferences) error {
				return table.write(formatUint(preferences.UserId), formatUintPtr(preferences.QuickScanDefaultGroupId),
					formatUintPtr(preferences.QuickScanDefaultPaidById), string(preferences.QuickScanDefaultStatus),
					formatBool(preferences.CloseChipSelectOnSelect), formatDecimalPtr(preferences.MonthlySpendingGoal),
					preferences.Language, preferences.AiLanguage, preferences.Region, formatBool(preferences.OnboardingPending),
					formatIntPtr(preferences.WarrantyPeriodYears), formatIntPtr(preferences.WarrantyReminderLeadDays))
			})
		},
	},
	{
		name:    "dashboard_layouts",
		columns: []string{"user_id", "layout"},
		write: func(state *exportState, table *tableWriter) error {
			return eachInBatches(state.tx.Model(models.DashboardLayout{}), func(layout models.DashboardLayout) error {
				return table.write(formatUint(layout.UserId), layout.Layout)
			})
		},
	},
	{
		name: "group_receipt_settings",
		columns: []string{"group_id", "hide_images", "hide_receipt_categories", "hide_receipt_tags", "hide_note",
			"quick_scan_note_enabled", "quick_scan_default_paid_by_type", "quick_scan_default_paid_by_id",
			"quick_scan_default_status"},
		write: func(state *exportState, table *tableWriter) error {
			query := state.tx.Model(models.GroupReceiptSettings{}).
				Where("group_id IN (?)", state.tx.Model(models.Group{}).Select("id").Where("is_all_group = ?", false))
			return eachInBatches(query, func(settings models.GroupReceiptSettings) error {
				return table.write(formatUint(settings.GroupId), formatBool(settings.HideImages),
					formatBool(settings.HideReceiptCategories), formatBool(settings.HideReceiptTags),
					formatBool(settings.HideNote), formatBool(settings.QuickScanNoteEnabled),
					string(settings.QuickScanDefaultPaidByType), formatUintPtr(settings.QuickScanDefaultPaidById),
					string(settings.QuickScanDefaultStatus))
			})
		},
	},
}

// joinTableSpec exports a two-column link table (the many2many tables GORM creates) in key order.
func joinTableSpec(name string, leftColumn string, rightColumn string) tableSpec {
	return tableSpec{
		name:    name,
		columns: []string{leftColumn, rightColumn},
		write: func(state *exportState, table *tableWriter) error {
			rows, err := state.tx.Table(name).Select(leftColumn, rightColumn).Order(leftColumn + ", " + rightColumn).Rows()
			if err != nil {
				return err
			}
			defer rows.Close()

			for rows.Next() {
				var left, right uint
				if err := rows.Scan(&left, &right); err != nil {
					return err
				}
				if err := table.write(formatUint(left), formatUint(right)); err != nil {
					return err
				}
			}
			return rows.Err()
		},
	}
}
