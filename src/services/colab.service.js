// src/services/colab.service.js
const axios = require('axios');
const { logger } = require('../utils/logger');

class ColabService {
  constructor() {
    this.baseUrl = process.env.COLAB_VTON_URL;
    this.apiKey = process.env.COLAB_API_KEY;
    this.timeout = 120000; // 2 minutes
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'ngrok-skip-browser-warning': 'true'
    };
  }

  /**
   * Submit a try-on job to Google Colab VITON-HD/IDM-VTON
   * @param {string} userImageUrl - Cloudinary URL of user photo
   * @param {string} garmentImageUrl - Cloudinary URL of garment
   * @returns {{ jobId: string, resultImageUrl: string }}
   */
  async submitTryOn(userImageUrl, garmentImageUrl) {
    if (!this.baseUrl) {
      // Return mock result if Colab URL not configured
      logger.warn('COLAB_VTON_URL not set - returning mock result');
      return this.getMockResult(userImageUrl);
    }

    try {
      logger.info(`Submitting try-on to Colab: ${this.baseUrl}`);

      // Try synchronous first (some Colab implementations return directly)
      const response = await axios.post(
        `${this.baseUrl}/tryon`,
        { person_image_url: userImageUrl, cloth_image_url: garmentImageUrl },
        { headers: this.getHeaders(), timeout: this.timeout }
      );

      const data = response.data;

      // Handle async job response
      if (data.job_id) {
        const result = await this.pollForResult(data.job_id);
        return result;
      }

      // Handle direct result
      if (data.result_image_url || data.output_url) {
        return {
          jobId: `direct-${Date.now()}`,
          resultImageUrl: data.result_image_url || data.output_url
        };
      }

      throw new Error('Unexpected response format from Colab service');
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        logger.warn('Colab service unavailable - using mock result');
        return this.getMockResult(userImageUrl);
      }
      logger.error('Colab submitTryOn error:', error.message);
      throw error;
    }
  }

  /**
   * Poll for async job completion
   */
  async pollForResult(jobId, maxAttempts = 30, intervalMs = 5000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/status/${jobId}`,
          { headers: this.getHeaders(), timeout: 15000 }
        );

        const { status, result_url, error } = response.data;

        if (status === 'completed' && result_url) {
          return { jobId, resultImageUrl: result_url };
        }

        if (status === 'failed') {
          throw new Error(error || 'Try-on processing failed on Colab');
        }

        logger.info(`Try-on job ${jobId} status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      } catch (error) {
        if (attempt === maxAttempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    throw new Error('Try-on processing timed out after 150 seconds');
  }

  /**
   * Mock result for development/testing when Colab is not available
   */
  getMockResult(userImageUrl) {
    // Return a placeholder result image
    const mockResultUrl = 'https://res.cloudinary.com/demo/image/upload/v1580125284/sample.jpg';
    return {
      jobId: `mock-${Date.now()}`,
      resultImageUrl: mockResultUrl
    };
  }

  /**
   * Check Colab service health
   */
  async checkHealth() {
    if (!this.baseUrl) return { healthy: false, message: 'COLAB_VTON_URL not configured' };

    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      return { healthy: true, data: response.data };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
}

const colabService = new ColabService();

module.exports = { colabService };
