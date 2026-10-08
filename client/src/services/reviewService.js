import api from './api';

export const reviewService = {
  createReview: async (reviewData) => {
    return await api.post('/reviews', reviewData);
  },

  getServiceReviews: async (serviceId) => {
    return await api.get(`/reviews/service/${serviceId}`);
  },

  getProviderReviews: async (providerId) => {
    return await api.get(`/reviews/provider/${providerId}`);
  },
};
