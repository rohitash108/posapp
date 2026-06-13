import client from './client';

export const ticketsApi = {
  /** GET /tickets — list all tickets for this restaurant */
  list: (params?: { status?: string; priority?: string; page?: number; per_page?: number }) =>
    client.get('/tickets', { params }),

  /** GET /tickets/:id — show ticket with replies */
  show: (id: number) => client.get(`/tickets/${id}`),

  /** POST /tickets — create a new ticket */
  create: (payload: {
    subject: string;
    description: string;
    priority?: string;
    category?: string;
  }) => client.post('/tickets', payload),

  /** PUT /tickets/:id — edit subject / description / priority */
  update: (id: number, payload: {
    subject?: string;
    description?: string;
    priority?: string;
    category?: string;
  }) => client.put(`/tickets/${id}`, payload),

  /** PATCH /tickets/:id/status — update ticket status */
  updateStatus: (id: number, status: string) =>
    client.patch(`/tickets/${id}/status`, { status }),

  /** POST /tickets/:id/replies — add a reply */
  reply: (id: number, message: string) =>
    client.post(`/tickets/${id}/replies`, { message }),

  /** DELETE /tickets/:id — delete a ticket (Restaurant Admin only) */
  delete: (id: number) => client.delete(`/tickets/${id}`),
};
