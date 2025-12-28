import { json } from '@sveltejs/kit';
import {
	getNotificationSetting,
	updateNotificationSetting,
	deleteNotificationSetting,
	type SmtpConfig,
	type AppriseConfig,
	type NotificationEventType
} from '$lib/server/db';
import { authorize } from '$lib/server/authorize';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const auth = await authorize(cookies);
	if (auth.authEnabled && !await auth.can('notifications', 'view')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid ID' }, { status: 400 });
		}

		const setting = await getNotificationSetting(id);
		if (!setting) {
			return json({ error: 'Notification setting not found' }, { status: 404 });
		}

		// Don't expose passwords
		const safeSetting = {
			...setting,
			config: setting.type === 'smtp' ? {
				...setting.config,
				password: setting.config.password ? '********' : undefined
			} : setting.config
		};

		return json(safeSetting);
	} catch (error) {
		console.error('Error fetching notification setting:', error);
		return json({ error: 'Failed to fetch notification setting' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const auth = await authorize(cookies);
	if (auth.authEnabled && !await auth.can('notifications', 'edit')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid ID' }, { status: 400 });
		}

		const existing = await getNotificationSetting(id);
		if (!existing) {
			return json({ error: 'Notification setting not found' }, { status: 404 });
		}

		const body = await request.json();
		const { name, enabled, config, event_types, eventTypes } = body;
		// Support both snake_case (legacy) and camelCase (new) for event types
		const resolvedEventTypes = eventTypes || event_types;

		// If updating config, validate based on type
		if (config) {
			if (existing.type === 'smtp') {
				const smtpConfig = config as SmtpConfig;
				if (!smtpConfig.host || !smtpConfig.port || !smtpConfig.from_email || !smtpConfig.to_emails?.length) {
					return json({ error: 'SMTP config requires host, port, from_email, and to_emails' }, { status: 400 });
				}
				// If password is masked, keep the existing one
				if (smtpConfig.password === '********') {
					smtpConfig.password = (existing.config as SmtpConfig).password;
				}
			} else if (existing.type === 'apprise') {
				const appriseConfig = config as AppriseConfig;
				if (!appriseConfig.urls?.length) {
					return json({ error: 'Apprise config requires at least one URL' }, { status: 400 });
				}
			}
		}

		const updated = await updateNotificationSetting(id, {
			name,
			enabled,
			config,
			eventTypes: resolvedEventTypes as NotificationEventType[]
		});
		if (!updated) {
			return json({ error: 'Failed to update notification setting' }, { status: 500 });
		}

		// Don't expose passwords in response
		const safeSetting = {
			...updated,
			config: updated.type === 'smtp' ? {
				...updated.config,
				password: updated.config.password ? '********' : undefined
			} : updated.config
		};

		return json(safeSetting);
	} catch (error: any) {
		console.error('Error updating notification setting:', error);
		return json({ error: error.message || 'Failed to update notification setting' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const auth = await authorize(cookies);
	if (auth.authEnabled && !await auth.can('notifications', 'delete')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	try {
		const id = parseInt(params.id);
		if (isNaN(id)) {
			return json({ error: 'Invalid ID' }, { status: 400 });
		}

		const deleted = await deleteNotificationSetting(id);
		if (!deleted) {
			return json({ error: 'Notification setting not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting notification setting:', error);
		return json({ error: 'Failed to delete notification setting' }, { status: 500 });
	}
};
