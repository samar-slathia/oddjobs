import api from './api';

export const bookingService = {
  createBooking: async (bookingData) => {
    return await api.post('/bookings', bookingData);
  },

  getBookings: async (params = {}) => {
    return await api.get('/bookings', { params });
  },

  getBookingById: async (id) => {
    return await api.get(`/bookings/${id}`);
  },

  updateBookingStatus: async (id, statusData) => {
    return await api.patch(`/bookings/${id}/status`, statusData);
  },
};
