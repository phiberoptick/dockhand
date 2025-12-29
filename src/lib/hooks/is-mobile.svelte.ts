import { browser } from '$app/environment';

const DEFAULT_MOBILE_BREAKPOINT = 768;

export class IsMobile {
	#breakpoint: number;
	#current = $state(false);

	constructor(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
		this.#breakpoint = breakpoint;

		if (browser) {
			// Set initial value
			this.#current = window.innerWidth < this.#breakpoint;

			// Listen for resize events
			const handleResize = () => {
				this.#current = window.innerWidth < this.#breakpoint;
			};

			window.addEventListener('resize', handleResize);

			// Also use matchMedia for more reliable detection
			const mql = window.matchMedia(`(max-width: ${this.#breakpoint - 1}px)`);
			const handleMediaChange = (e: MediaQueryListEvent) => {
				this.#current = e.matches;
			};
			mql.addEventListener('change', handleMediaChange);
		}
	}

	get current() {
		return this.#current;
	}
}
