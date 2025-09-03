import * as svc from '../services/locations.service.js';

export const list = async (req, res) => res.json(await svc.listLocations(req.query));
export const detail = async (req, res) => res.json(await svc.getLocation(+req.params.locationId));
export const create = async (req, res) => {
  const loc = await svc.createLocation(req.body);
  res.status(201).json(loc);
};
