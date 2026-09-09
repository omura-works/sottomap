"use client";

// S6「確認」回答後の灯り演出（原本の `showRewards` 相当）ON/OFF設定。
// ユーザー設定を保存するテーブルは docs/CONTRACT.md に無いため、
// ブラウザの localStorage にのみ保持する端末ローカルの表示設定として扱う。
//
// localStorage は React の外側にある可変ストアなので、effect内での
// setState（サーバー/クライアントの初期描画がずれてカスケード再レンダーを招く）
// を避けるため useSyncExternalStore で読む。

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "urasupo:showRewards";

function readStoredValue(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getServerSnapshot(): boolean {
  return true;
}

/** 灯り演出（+5 やバッジ残数表示）を出すかどうかの端末設定。既定はON。 */
export function useShowRewardsSetting(): [boolean, (value: boolean) => void] {
  const showRewards = useSyncExternalStore(subscribe, readStoredValue, getServerSnapshot);

  const setShowRewards = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
      // 同タブ内では "storage" イベントが発火しないため、自前でも通知する。
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    } catch {
      // プライベートブラウジング等で書き込めない場合は端末設定を諦める。
    }
  }, []);

  return [showRewards, setShowRewards];
}
