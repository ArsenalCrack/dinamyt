import { Injectable } from '@angular/core';
import { Country, City, ICountry, ICity } from 'country-state-city';

export interface CountrySimple {
    name: string;
    isoCode: string;
    phonecode: string;
    flag: string;
}

export interface CitySimple {
    name: string;
    countryCode: string;
    stateCode: string;
}

@Injectable({
    providedIn: 'root'
})
export class LocationService {

    constructor() { }

    getAllCountries(): CountrySimple[] {
        return Country.getAllCountries().map(c => ({
            name: c.name,
            isoCode: c.isoCode,
            phonecode: c.phonecode,
            flag: c.flag
        }));
    }

    getCountryByCode(isoCode: string): CountrySimple | undefined {
        const c = Country.getCountryByCode(isoCode);
        if (!c) return undefined;

        return {
            name: c.name,
            isoCode: c.isoCode,
            phonecode: c.phonecode,
            flag: c.flag
        };
    }

    // Buscar país por nombre (útil para restaurar estado desde strings de la BD)
    getCountryByName(name: string): CountrySimple | undefined {
        if (!name) return undefined;
        const cleanName = name.trim().toLowerCase();
        // Puede ser lento si se llama frecuentemente, pero está bien para inicialización
        const all = Country.getAllCountries();
        return all.find(c => c.name.toLowerCase() === cleanName) ?
            this.mapCountry(all.find(c => c.name.toLowerCase() === cleanName)!) : undefined;
    }

    getCitiesByCountryCode(countryCode: string): CitySimple[] {
        const cities = City.getCitiesOfCountry(countryCode);
        if (!cities) return [];

        return cities.map(c => ({
            name: c.name,
            countryCode: c.countryCode,
            stateCode: c.stateCode
        }));
    }

    private mapCountry(c: ICountry): CountrySimple {
        return {
            name: c.name,
            isoCode: c.isoCode,
            phonecode: c.phonecode,
            flag: c.flag
        };
    }
}
