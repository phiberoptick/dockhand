import { writable, derived } from 'svelte/store';

export type LicenseType = 'enterprise' | 'smb';

export interface LicenseState {
	isEnterprise: boolean;
	isLicensed: boolean;
	licenseType: LicenseType | null;
	loading: boolean;
	licensedTo: string | null;
	expiresAt: string | null;
}

function createLicenseStore() {
	const { subscribe, set, update } = writable<LicenseState>({
		isEnterprise: false,
		isLicensed: false,
		licenseType: null,
		loading: true,
		licensedTo: null,
		expiresAt: null
	});

	return {
		subscribe,
		async check() {
			update(state => ({ ...state, loading: true }));
			try {
				const response = await fetch('/api/license');
				const data = await response.json();
				const isValid = data.valid && data.active;
				const licenseType = data.payload?.type as LicenseType | undefined;
				set({
					isEnterprise: isValid && licenseType === 'enterprise',
					isLicensed: isValid,
					licenseType: isValid ? (licenseType || null) : null,
					loading: false,
					licensedTo: data.stored?.name || null,
					expiresAt: data.payload?.expires || null
				});
			} catch {
				set({ isEnterprise: false, isLicensed: false, licenseType: null, loading: false, licensedTo: null, expiresAt: null });
			}
		},
		setEnterprise(value: boolean) {
			update(state => ({ ...state, isEnterprise: value }));
		},
		/** Wait for the store to finish loading */
		waitUntilLoaded(): Promise<LicenseState> {
			return new Promise((resolve) => {
				const unsubscribe = subscribe((state) => {
					if (!state.loading) {
						// Use setTimeout to avoid unsubscribing during callback
						setTimeout(() => unsubscribe(), 0);
						resolve(state);
					}
				});
			});
		}
	};
}

export const licenseStore = createLicenseStore();

// Derived store for days until expiration
export const daysUntilExpiry = derived(licenseStore, ($license) => {
	if (!$license.isLicensed || !$license.expiresAt) return null;

	const now = new Date();
	const expires = new Date($license.expiresAt);
	const diffTime = expires.getTime() - now.getTime();
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	return diffDays;
});
