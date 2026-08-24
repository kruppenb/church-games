import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TEACHER_KEY_STORAGE,
  clearTeacherKey,
  readTeacherKey,
  saveTeacherKey,
} from "@/lib/teacher-session";

const KEY = "s3cret-key";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("readTeacherKey", () => {
  it("is null when nothing is stored", () => {
    expect(readTeacherKey()).toBeNull();
  });

  it("reads the session copy", () => {
    sessionStorage.setItem(TEACHER_KEY_STORAGE, KEY);
    expect(readTeacherKey()).toBe(KEY);
  });

  it("prefers the remembered (localStorage) copy over the session one", () => {
    sessionStorage.setItem(TEACHER_KEY_STORAGE, "session-phrase");
    localStorage.setItem(TEACHER_KEY_STORAGE, KEY);
    expect(readTeacherKey()).toBe(KEY);
  });

  it("treats a blank stored value as no key", () => {
    localStorage.setItem(TEACHER_KEY_STORAGE, "   ");
    sessionStorage.setItem(TEACHER_KEY_STORAGE, "");
    expect(readTeacherKey()).toBeNull();
  });
});

describe("saveTeacherKey", () => {
  it("remember=true writes localStorage and wipes the session copy", () => {
    sessionStorage.setItem(TEACHER_KEY_STORAGE, "older-phrase");

    saveTeacherKey(KEY, true);

    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBe(KEY);
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(readTeacherKey()).toBe(KEY);
  });

  it("remember=false writes sessionStorage and wipes the remembered copy", () => {
    localStorage.setItem(TEACHER_KEY_STORAGE, "older-phrase");

    saveTeacherKey(KEY, false);

    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBe(KEY);
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(readTeacherKey()).toBe(KEY);
  });
});

describe("clearTeacherKey", () => {
  it("wipes both storages", () => {
    localStorage.setItem(TEACHER_KEY_STORAGE, KEY);
    sessionStorage.setItem(TEACHER_KEY_STORAGE, KEY);

    clearTeacherKey();

    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(readTeacherKey()).toBeNull();
  });
});

describe("blocked storage (private mode / partitioned iframe)", () => {
  function blockStorage() {
    const boom = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
  }

  it("reads as 'no key' instead of throwing", () => {
    blockStorage();
    expect(readTeacherKey()).toBeNull();
  });

  it("save and clear never throw", () => {
    blockStorage();
    expect(() => saveTeacherKey(KEY, true)).not.toThrow();
    expect(() => saveTeacherKey(KEY, false)).not.toThrow();
    expect(() => clearTeacherKey()).not.toThrow();
  });
});
