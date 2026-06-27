import { cn } from "../utils";

describe("cn utility", () => {
  it("should merge standard classes", () => {
    expect(cn("class1", "class2")).toBe("class1 class2");
  });

  it("should resolve Tailwind conflicts", () => {
    // p-4 should override p-2
    expect(cn("p-2", "p-4")).toBe("p-4");
    // text-lg should override text-sm
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("should handle conditional classes", () => {
    expect(cn("base-class", { "active-class": true, "inactive-class": false })).toBe("base-class active-class");
  });

  it("should filter out falsy values", () => {
    expect(cn("valid", null, undefined, false, 0, "", "also-valid")).toBe("valid also-valid");
  });

  it("should handle array inputs", () => {
    expect(cn(["classA", "classB"], "classC")).toBe("classA classB classC");
  });

  it("should handle mixed complex inputs", () => {
    const isActive = true;
    const isHovered = false;
    expect(
      cn(
        "base",
        { "active": isActive, "hover": isHovered },
        ["array-class"],
        isActive && "conditional-class",
        "p-2 p-4" // tailwind conflict in a single string
      )
    ).toBe("base active array-class conditional-class p-4");
  });
});
