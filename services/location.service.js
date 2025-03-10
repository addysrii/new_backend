
class LocationService {
  /**
   * Validate coordinates
   * @param {number} lat Latitude
   * @param {number} lon Longitude
   * @returns {boolean} Whether the coordinates are valid
   */
  validateCoordinates(lat, lon) {
    return (
      typeof lat === 'number' && !isNaN(lat) &&
      typeof lon === 'number' && !isNaN(lon) &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180
    );
  }
  
  /**
   * Calculate distance between two points using Haversine formula
   * @param {number} lat1 First latitude
   * @param {number} lon1 First longitude
   * @param {number} lat2 Second latitude
   * @param {number} lon2 Second longitude
   * @returns {number} Distance in kilometers
   */
  getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    if (!this.validateCoordinates(lat1, lon1) || !this.validateCoordinates(lat2, lon2)) {
      return null;
    }
    
    try {
      const R = 6371; // Radius of the earth in km
      const dLat = this.deg2rad(lat2 - lat1);
      const dLon = this.deg2rad(lon2 - lon1);
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
      const d = R * c; // Distance in km
      return d;
    } catch (error) {
      console.error('Error calculating distance:', error);
      return null;
    }
  }
  
  /**
   * Convert degrees to radians
   * @param {number} deg Degrees
   * @returns {number} Radians
   */
  deg2rad(deg) {
    return deg * (Math.PI/180);
  }
  
  /**
   * Get address from coordinates using Google Maps API
   * @param {number} lat Latitude
   * @param {number} lng Longitude
   * @returns {Promise<string>} Address
   */
  async getAddressFromCoordinates(lat, lng) {
    try {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        throw new Error('Google Maps API key not configured');
      }
      
      const axios = require('axios');
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
      );
      
      if (response.data.results && response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      }
      
      return '';
    } catch (error) {
      console.error('Get address error:', error);
      return '';
    }
  }
}

module.exports = new LocationService();