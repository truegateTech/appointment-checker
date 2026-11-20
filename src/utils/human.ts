import type { Locator, Page } from "playwright";

export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const humanPause = (min = 600, max = 1500): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, randomInt(min, max)));

export const humanClick = async (
  page: Page,
  locator: Locator,
): Promise<void> => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();

  if (box) {
    // Move along a multi-step path to a randomized off-center point inside the element
    const targetX = box.x + box.width * (0.25 + Math.random() * 0.5);
    const targetY = box.y + box.height * (0.25 + Math.random() * 0.5);
    await page.mouse.move(targetX, targetY, { steps: randomInt(8, 18) });
    await humanPause(120, 340);
  }

  await locator.click();
};

export const humanType = async (
  locator: Locator,
  text: string,
): Promise<void> => {
  await locator.click();
  await humanPause(180, 420);
  await locator.fill("");

  for (const char of text) {
    await locator.pressSequentially(char);
    await humanPause(45, 145);
  }
};
