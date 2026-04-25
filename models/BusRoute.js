// models/BusRoute.js
// Collection: bus_routes
// Stores daily bus routes and stops for the Lagos staff bus.

const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    lat:  { type: Number, required: true },
    lng:  { type: Number, required: true },
  },
  { _id: false }
);

const busRouteSchema = new mongoose.Schema(
  {
    // ISO date string: "YYYY-MM-DD"
    date: {
      type:     String,
      required: true,
      unique:   true,
      match:    /^\d{4}-\d{2}-\d{2}$/,
      index:    true,
    },
    // Array of [lat, lng] pairs defining the polyline
    route_coordinates: {
      type:    [[Number]],
      default: [],
    },
    stops: {
      type:    [stopSchema],
      default: [],
    },
  },
  { timestamps: true }
);

busRouteSchema.set('toJSON', {
  transform (doc, ret) {
    ret.id = ret._id.toString();
    // Expose route_coordinates as routeCoordinates for frontend convenience
    ret.routeCoordinates = ret.route_coordinates;
    delete ret._id;
    delete ret.__v;
    delete ret.route_coordinates;
    return ret;
  },
});

module.exports = mongoose.model('BusRoute', busRouteSchema);
