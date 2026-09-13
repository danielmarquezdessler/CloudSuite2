import { sendDueInvoiceNotifications } from '../dist/services/smartplannerFinance.service.js';

const result = await sendDueInvoiceNotifications();
console.log(`SmartPlanner: ${result.sent} notificaciones de facturas enviadas (${result.reviewed} facturas revisadas).`);
