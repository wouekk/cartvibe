import { AfterViewInit, Component, OnInit, signal, TemplateRef, viewChild, inject } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { Store } from "@ngxs/store";
import { take, tap } from "rxjs";
import { TableComponent } from "src/table/table/table.component";
import { DEFAULT_DIALOG_CONFIG, DEFAULT_HOST_CLASS } from "../../constants";
import { ApiKeyService, ApiKeyView, AssociatedApiKeys, Permission } from "../../open-api";
import { BaseTableService } from "../../services/base-table.service";
import { SnackbarService } from "../../services/snackbar.service";
import { BaseTableComponent } from "../../shared-ui/base-table/base-table.component";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthState } from "../../store";
import { ApiKeyTableState } from "../../store/api-key-table.state";
import { ApiKeyFormDialogComponent } from "../api-key-form-dialog/api-key-form-dialog.component";
import { ApiKeyTableFilterComponent } from "../api-key-table-filter/api-key-table-filter.component";
import { ApiKeyTableService } from "./api-key-table.service";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";

@UntilDestroy()
@Component({
  selector: "app-api-key-table",
  templateUrl: "./api-key-table.component.html",
  styleUrls: ["./api-key-table.component.scss"],
  host: DEFAULT_HOST_CLASS,
  providers: [
    {
      provide: BaseTableService,
      useClass: ApiKeyTableService
    }
  ],
  standalone: false
})
export class ApiKeyTableComponent extends BaseTableComponent<ApiKeyView> implements OnInit, AfterViewInit {
  private readonly translation = inject(TranslationService);

  private readonly nameCell = viewChild.required<TemplateRef<any>>("nameCell");

  private readonly descriptionCell = viewChild.required<TemplateRef<any>>("descriptionCell");

  private readonly createdByCell = viewChild.required<TemplateRef<any>>("createdByCell");

  private readonly createdAtCell = viewChild.required<TemplateRef<any>>("createdAtCell");

  private readonly lastUsedAtCell = viewChild.required<TemplateRef<any>>("lastUsedAtCell");

  private readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  private readonly table = viewChild.required(TableComponent);

  protected readonly Permission = Permission;

  public readonly canViewAll = this.store.selectSignal(
    AuthState.hasAppPermission(Permission.AppApiKeysReadAny)
  );

  public readonly canCreate = this.store.selectSignal(
    AuthState.hasAppPermission(Permission.AppApiKeysCreate)
  );

  public tableHeaderText = signal(marker("My API Keys"));

  private currentUserId = "";

  constructor(
    public override baseTableService: BaseTableService,
    private store: Store,
    private matDialog: AppDialog,
    private apiKeyService: ApiKeyService,
    private snackbarService: SnackbarService
  ) {
    super(baseTableService);
  }

  public ngOnInit(): void {
    this.currentUserId = this.store.selectSnapshot(AuthState.userId);
    this.listenForFilterChanges();
  }

  public ngAfterViewInit(): void {
    this.initTable();
  }

  private listenForFilterChanges(): void {
    this.store.select(ApiKeyTableState.filter)
      .pipe(
        untilDestroyed(this),
        tap((filter) => {
            this.getTableData();
            if (filter.associatedApiKeys === AssociatedApiKeys.All) {
              this.tableHeaderText.set(marker("All API Keys"));
            } else {
              this.tableHeaderText.set(marker("My API Keys"));
            }
          }
        )
      )
      .subscribe();
  }

  private initTable(): void {
    this.setColumns();
  }

  private setColumns(): void {
    this.columns = [
      {
        columnHeader: "Name",
        matColumnDef: "name",
        template: this.nameCell(),
        sortable: true,
      },
      {
        columnHeader: "Description",
        matColumnDef: "description",
        template: this.descriptionCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Created By"),
        matColumnDef: "created_by",
        template: this.createdByCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Created At"),
        matColumnDef: "created_at",
        template: this.createdAtCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Last Used At"),
        matColumnDef: "last_used_at",
        template: this.lastUsedAtCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Actions"),
        matColumnDef: "actions",
        template: this.actionsCell(),
        sortable: false,
      },
    ];
    this.displayedColumns = [
      "name",
      "description",
      "created_by",
      "created_at",
      "last_used_at",
      "actions",
    ];
  }

  public isOwner(apiKey: ApiKeyView): boolean {
    return apiKey.userId?.toString() === this.currentUserId;
  }

  public canEdit(apiKey: ApiKeyView): boolean {
    return this.isOwner(apiKey) &&
      this.store.selectSnapshot(AuthState.hasAppPermission(Permission.AppApiKeysUpdate));
  }

  public canDelete(apiKey: ApiKeyView): boolean {
    if (this.store.selectSnapshot(AuthState.hasAppPermission(Permission.AppApiKeysDeleteAny))) {
      return true;
    }

    return this.isOwner(apiKey) &&
      this.store.selectSnapshot(AuthState.hasAppPermission(Permission.AppApiKeysDelete));
  }

  public openFilterDialog(): void {
    const ref = this.matDialog.open(ApiKeyTableFilterComponent, DEFAULT_DIALOG_CONFIG);
  }

  public openCreateApiKeyDialog(): void {
    const ref = this.matDialog.open(ApiKeyFormDialogComponent, DEFAULT_DIALOG_CONFIG);

    ref.componentInstance.headerText = marker("Create API Key");

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.getTableData();
      }
    });
  }

  public openEditDialog(apiKeyView: ApiKeyView): void {
    const ref = this.matDialog.open(ApiKeyFormDialogComponent, DEFAULT_DIALOG_CONFIG);

    ref.componentInstance.apiKey = apiKeyView;
    ref.componentInstance.headerText = this.translation.t("Edit {name}", { name: apiKeyView.name });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.getTableData();
      }
    });
  }

  public deleteApiKey(apiKeyView: ApiKeyView): void {
    if (!apiKeyView.id) {
      this.snackbarService.error("Cannot delete API key: ID is missing");
      return;
    }

    const dialogRef = this.matDialog.open(
      ConfirmationDialogComponent,
      DEFAULT_DIALOG_CONFIG
    );

    dialogRef.componentInstance.headerText = "Delete API Key";
    dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you would like to delete the API key \"{name}\"? This action is irreversible and the API key will no longer be usable.", { name: apiKeyView.name });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed && apiKeyView.id) {
        this.apiKeyService
          .deleteApiKey(apiKeyView.id)
          .pipe(
            take(1),
            tap(() => {
              this.snackbarService.success(this.translation.t("API key \"{name}\" successfully deleted", { name: apiKeyView.name }));
              this.getTableData();
            })
          )
          .subscribe();
      }
    });
  }
}
