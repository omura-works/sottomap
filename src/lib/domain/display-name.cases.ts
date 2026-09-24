// SPEC §9.18-1（2026-09-25、R23 重要1）: 表示名の検査の「アプリと DB で同じ判定になる」ことを確かめる文字列の一覧。
// 単体テスト（./display-name.test.ts）が validateDisplayName に、pgTAP（supabase/tests/0016_display_name_server_only.sql）が
// DB 関数 set_display_name に、同じ一覧を流す。pgTAP 側の一覧がこの一覧と同じであることも単体テストが照合する。
// 文字はコードポイントの配列で持つ（見えない文字をファイルに直接書かないため）。

import { DISPLAY_NAME_MESSAGES } from "./display-name";

export interface DisplayNameCase {
  label: string;
  codePoints: readonly number[];
  /** "ok" は受け付けて同じ名前を保存する。それ以外は拒否の文言。 */
  expected: "ok" | string;
}

const JP_AKARI = [0x706f, 0x308a]; // 灯り
const JP_NOHITO = [0x306e, 0x4eba]; // の人
const PERSIAN = [0x0645, 0x06cc, 0x200c, 0x062e, 0x0648, 0x0627, 0x0647, 0x0645]; // می‌خواهم
const FLAG_ENGLAND = [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f];
const FLAG_SCOTLAND = [0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f];
const FLAG_WALES = [0x1f3f4, 0xe0067, 0xe0062, 0xe0077, 0xe006c, 0xe0073, 0xe007f];

const OK = "ok";
const INVISIBLE = DISPLAY_NAME_MESSAGES.invisible;

export const DISPLAY_NAME_CASES: readonly DisplayNameCase[] = [
  // 受け付ける
  { label: "普通の名前", codePoints: [...JP_AKARI, ...JP_NOHITO], expected: OK },
  { label: "記号だけの名前（U+2100）", codePoints: [0x2100], expected: OK },
  { label: "家族の絵文字（ZWJ）", codePoints: [0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466], expected: OK },
  { label: "職業の絵文字（ZWJ）", codePoints: [0x1f9d1, 0x200d, 0x1f373], expected: OK },
  { label: "肌の色を付けた職業の絵文字（修飾子の後の ZWJ）", codePoints: [0x1f9d1, 0x1f3fd, 0x200d, 0x1f692], expected: OK },
  { label: "VS16 の後の ZWJ（レインボーフラッグ）", codePoints: [0x1f3f3, 0xfe0f, 0x200d, 0x1f308], expected: OK },
  { label: "ハートに火（VS16 の後の ZWJ）", codePoints: [0x2764, 0xfe0f, 0x200d, 0x1f525, ...JP_NOHITO], expected: OK },
  { label: "異体字セレクタ付きの絵文字", codePoints: [...JP_AKARI, 0x2764, 0xfe0f], expected: OK },
  { label: "イングランドの旗", codePoints: [...FLAG_ENGLAND, ...JP_AKARI], expected: OK },
  { label: "スコットランドの旗を2つ並べる", codePoints: [...FLAG_SCOTLAND, ...FLAG_SCOTLAND], expected: OK },
  { label: "ウェールズの旗", codePoints: [...FLAG_WALES], expected: OK },
  { label: "黒旗だけ（タグ列なし）", codePoints: [0x1f3f4], expected: OK },
  { label: "肌の色の修飾子だけ", codePoints: [0x1f3fd], expected: OK },
  { label: "結合文字の付いた文字", codePoints: [0x0065, 0x0301], expected: OK },
  // ZWNJ は全面禁止
  { label: "ZWNJ だけ", codePoints: [0x200c], expected: INVISIBLE },
  { label: "ZWNJ を含む名前（ペルシア語）", codePoints: PERSIAN, expected: INVISIBLE },
  { label: "ラテン文字の間の ZWNJ", codePoints: [0x61, 0x62, 0x200c, 0x63, 0x64], expected: INVISIBLE },
  { label: "記号の間の ZWNJ（U+2100 ZWNJ U+2100）", codePoints: [0x2100, 0x200c, 0x2100], expected: INVISIBLE },
  { label: "ZWNJ と21文字（見えない文字を長さより先に調べる）", codePoints: [0x200c, ...Array<number>(21).fill(0x3042)], expected: INVISIBLE },
  // ZWJ は前後が絵文字のときだけ
  { label: "ZWJ だけ", codePoints: [0x200d], expected: INVISIBLE },
  { label: "ZWJ と ZWNJ だけ", codePoints: [0x200d, 0x200c, 0x200d], expected: INVISIBLE },
  { label: "文字の間の ZWJ", codePoints: [...JP_AKARI, 0x200d, ...JP_NOHITO], expected: INVISIBLE },
  { label: "絵文字の後・文字の前の ZWJ", codePoints: [0x1f3ee, 0x200d, ...JP_NOHITO], expected: INVISIBLE },
  { label: "文字の後・絵文字の前の ZWJ", codePoints: [...JP_AKARI, 0x200d, 0x1f3ee], expected: INVISIBLE },
  { label: "末尾の ZWJ", codePoints: [0x1f3ee, 0x200d], expected: INVISIBLE },
  { label: "先頭の ZWJ", codePoints: [0x200d, 0x1f3ee], expected: INVISIBLE },
  { label: "ZWJ の連続", codePoints: [0x1f468, 0x200d, 0x200d, 0x1f469], expected: INVISIBLE },
  { label: "記号の間の ZWJ（U+2100 ZWJ U+2100）", codePoints: [0x2100, 0x200d, 0x2100], expected: INVISIBLE },
  // タグ文字は3つの旗だけ
  { label: "タグ文字だけ", codePoints: [0xe0067, 0xe0062], expected: INVISIBLE },
  { label: "タグの終端だけ", codePoints: [0xe007f], expected: INVISIBLE },
  { label: "終端の無いタグ列", codePoints: [...FLAG_ENGLAND.slice(0, 6), ...JP_AKARI], expected: INVISIBLE },
  { label: "黒旗の無いタグ列", codePoints: [...JP_AKARI, ...FLAG_ENGLAND.slice(1)], expected: INVISIBLE },
  { label: "黒旗以外の絵文字に付けたタグ列", codePoints: [0x1f3ee, 0xe0067, 0xe0062, 0xe007f], expected: INVISIBLE },
  { label: "文字の中に隠したタグ列", codePoints: [...JP_AKARI, 0xe0068, 0xe0069, ...JP_NOHITO], expected: INVISIBLE },
  { label: "タグの中身が無い終端", codePoints: [0x1f3f4, 0xe007f], expected: INVISIBLE },
  { label: "無効な旗のタグ列（gbzzz）", codePoints: [0x1f3f4, 0xe0067, 0xe0062, 0xe007a, 0xe007a, 0xe007a, 0xe007f], expected: INVISIBLE },
  { label: "3つ以外の地域の旗のタグ列（ustx）", codePoints: [0x1f3f4, 0xe0075, 0xe0073, 0xe0074, 0xe0078, 0xe007f], expected: INVISIBLE },
  { label: "イングランドの旗に余分なタグ", codePoints: [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe0078, 0xe007f], expected: INVISIBLE },
  { label: "タグ列の中の言語タグ（U+E0001）", codePoints: [0x1f3f4, 0xe0001, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f], expected: INVISIBLE },
  // 見える文字が1つも無い
  { label: "ハングルの埋め字だけ", codePoints: [0x3164], expected: INVISIBLE },
  { label: "点字の空白だけ", codePoints: [0x2800], expected: INVISIBLE },
  { label: "異体字セレクタだけ", codePoints: [0xfe0f], expected: INVISIBLE },
  { label: "結合文字だけ（U+0301）", codePoints: [0x0301], expected: INVISIBLE },
  { label: "結合文字だけ（U+05B0）", codePoints: [0x05b0], expected: INVISIBLE },
  { label: "囲み記号の結合文字だけ（U+20DD）", codePoints: [0x20dd], expected: INVISIBLE },
  { label: "結合文字を重ねただけ（U+0E31 U+0E34）", codePoints: [0x0e31, 0x0e34], expected: INVISIBLE },
  // 見えない書式文字（Cf）
  { label: "右から左への上書き（U+202E）", codePoints: [...JP_AKARI, 0x202e, ...JP_NOHITO], expected: INVISIBLE },
  { label: "先頭の U+FEFF", codePoints: [0xfeff, ...JP_AKARI], expected: INVISIBLE },
  // 検査の順
  { label: "制御文字だけ（見えない文字より先に「改行や制御文字」）", codePoints: [0x01], expected: DISPLAY_NAME_MESSAGES.control },
  { label: "並びの検査はメールアドレスの形より先", codePoints: [0x200d, 0x61, 0x40, 0x62], expected: INVISIBLE },
  { label: "メールアドレスの形", codePoints: [0x61, 0x40, 0x62], expected: DISPLAY_NAME_MESSAGES.email },
  { label: "21文字", codePoints: Array<number>(21).fill(0x3042), expected: DISPLAY_NAME_MESSAGES.tooLong },
];
