import { afterEach, describe, expect, it, vi } from "vitest";
import { installDoubleClickGuard } from "./doubleClick";

let remove = () => {};
afterEach(() => {
  remove();
  document.body.innerHTML = "";
});

const click = (el: Element, detail: number) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));

describe("installDoubleClickGuard", () => {
  it("drops the second click of a double-click on buttons and menu items", () => {
    remove = installDoubleClickGuard();
    document.body.innerHTML = `<button id="b">Send</button><div role="menuitem" id="m">Move</div>`;
    const onClick = vi.fn();
    document.addEventListener("click", onClick);
    click(document.getElementById("b")!, 1);
    click(document.getElementById("b")!, 2);
    click(document.getElementById("m")!, 1);
    click(document.getElementById("m")!, 2);
    expect(onClick).toHaveBeenCalledTimes(2);
    document.removeEventListener("click", onClick);
  });

  it("lets repeatable controls take every click", () => {
    remove = installDoubleClickGuard();
    document.body.innerHTML = `<span data-repeatable><button id="plus">+</button></span>`;
    const onClick = vi.fn();
    document.addEventListener("click", onClick);
    click(document.getElementById("plus")!, 1);
    click(document.getElementById("plus")!, 2);
    expect(onClick).toHaveBeenCalledTimes(2);
    document.removeEventListener("click", onClick);
  });
});
