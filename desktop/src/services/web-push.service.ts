import { inject, Injectable } from "@angular/core";
import { SwPush } from "@angular/service-worker";
import { firstValueFrom } from "rxjs";
import { NotificationsService, PushSubscriptionCommand } from "../open-api";
import { FeatureConfigStore } from "../store/feature-config.store";

/**
 * Web Push for warranty reminders. Permission is asked in context, when a person sets a warranty date, never at
 * start-up. Nothing happens when the server has no VAPID keys, the service worker is off (a dev build, plain http
 * on another host) or the person said no: the reminder still lands in the app's notifications.
 */
@Injectable({ providedIn: "root" })
export class WebPushService {
  private readonly featureConfigStore = inject(FeatureConfigStore);

  private readonly swPush = inject(SwPush, { optional: true });
  private readonly notificationsService = inject(NotificationsService);
  /** Whether this browser could show push at all (it may still be refused). */
  public isSupported(): boolean {
    return (
      !!this.swPush?.isEnabled &&
      !!this.featureConfigStore.webPushPublicKey() &&
      typeof Notification !== "undefined"
    );
  }

  /**
   * Asks for permission when it was never asked, then subscribes this browser and tells the server. Already allowed:
   * subscribes again quietly (a new device, or a subscription the browser renewed). Refused: does nothing.
   */
  public async enableForWarranties(): Promise<void> {
    if (!this.isSupported() || Notification.permission === "denied") {
      return;
    }

    try {
      const subscription = await this.swPush!.requestSubscription({
        serverPublicKey: this.featureConfigStore.webPushPublicKey(),
      });
      await firstValueFrom(
        this.notificationsService.savePushSubscription(subscription.toJSON() as PushSubscriptionCommand)
      );
    } catch {
      // Refused in the prompt, or the push service is unreachable: the in-app notification still comes.
    }
  }
}
