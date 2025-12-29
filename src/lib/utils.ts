import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

/**
 * Focus the first editable input field in a dialog.
 * Call this after a dialog opens to provide better keyboard UX.
 */
export function focusFirstInput() {
	setTimeout(() => {
		const input = document.querySelector<HTMLElement>(
			'[data-slot="dialog-content"] input:not([disabled]):not([type="hidden"]), ' +
			'[data-slot="dialog-content"] textarea:not([disabled])'
		);
		input?.focus();
	}, 50);
}
