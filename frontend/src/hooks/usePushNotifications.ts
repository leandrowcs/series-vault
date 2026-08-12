import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import {
  firebaseMessagingVapidKey,
  getFirebaseMessaging,
  hasFirebaseMessagingConfig,
} from "../firebase";
import {
  disableCloudNotificationSubscription,
  saveCloudNotificationSubscription,
} from "../services/cloudStore";

type PushNotificationStatus =
  | "unsupported"
  | "unconfigured"
  | "default"
  | "denied"
  | "loading"
  | "subscribed"
  | "error";

const getInitialPermission = () => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported" as const;
  }

  return Notification.permission;
};

const getStatusFromPermission = (
  permission: NotificationPermission | "unsupported",
): PushNotificationStatus => {
  if (!hasFirebaseMessagingConfig) return "unconfigured";
  if (permission === "unsupported") return "unsupported";
  if (permission === "granted") return "loading";
  return permission;
};

export const usePushNotifications = (uid?: string) => {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    getInitialPermission,
  );
  const [status, setStatus] = useState<PushNotificationStatus>(() =>
    getStatusFromPermission(getInitialPermission()),
  );
  const [token, setToken] = useState<string | null>(null);

  const isAvailable = useMemo(
    () => hasFirebaseMessagingConfig && permission !== "unsupported",
    [permission],
  );

  const registerToken = useCallback(async () => {
    if (!uid || !hasFirebaseMessagingConfig || permission === "unsupported") {
      setStatus(!hasFirebaseMessagingConfig ? "unconfigured" : "unsupported");
      return null;
    }

    try {
      setStatus("loading");

      const nextPermission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        setStatus(nextPermission);
        return null;
      }

      const messaging = await getFirebaseMessaging();
      const registration = await navigator.serviceWorker.ready;
      if (!messaging || !registration) {
        setStatus("unsupported");
        return null;
      }

      const nextToken = await getToken(messaging, {
        vapidKey: firebaseMessagingVapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!nextToken) {
        setStatus("default");
        return null;
      }

      await saveCloudNotificationSubscription(uid, nextToken);
      setToken(nextToken);
      setStatus("subscribed");
      return nextToken;
    } catch (error) {
      console.warn("Não foi possível ativar notificações push.", error);
      setStatus("error");
      return null;
    }
  }, [permission, uid]);

  const disableCurrentSubscription = useCallback(async () => {
    if (!uid || !token) return;

    await disableCloudNotificationSubscription(uid, token);
    setToken(null);
    setStatus(Notification.permission === "granted" ? "default" : Notification.permission);
  }, [token, uid]);

  useEffect(() => {
    if (!uid || permission !== "granted" || token) return;

    void registerToken();
  }, [permission, registerToken, token, uid]);

  useEffect(() => {
    if (!hasFirebaseMessagingConfig || permission !== "granted") return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const listenForForegroundMessages = async () => {
      const messaging = await getFirebaseMessaging();
      if (!messaging || cancelled) return;

      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "Series Vault";
        const body = payload.notification?.body;

        if (document.visibilityState === "visible" && body) {
          new Notification(title, {
            body,
            icon: "/icon-teal-v2-192x192.png",
            data: payload.data,
          });
        }
      });
    };

    void listenForForegroundMessages();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [permission]);

  return {
    disableCurrentSubscription,
    isAvailable,
    permission,
    registerToken,
    status,
    token,
  };
};

export type { PushNotificationStatus };
