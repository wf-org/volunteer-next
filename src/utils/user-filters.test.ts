import { paramsToUserFilters, recordToUserFilters, userFiltersToParams } from './user-filters';

describe('paramsToUserFilters', () => {
  it('should convert URLSearchParams to a UserFilters object', () => {
    const searchParams = new URLSearchParams({
      roleType: 'admin',
      searchQuery: 'test',
      showDeleted: 'true',
      withQualification: 'certified',
      withoutQualification: 'uncertified',
      onTeam: 'team123',
      eventHours: '5'
    });

    const result = paramsToUserFilters(searchParams);

    expect(result).toEqual({
      roleType: 'admin',
      searchQuery: 'test',
      showDeleted: true,
      withQualification: 'certified',
      withoutQualification: 'uncertified',
      onTeam: 'team123',
      eventHours: 5
    });
  });

  it('should handle missing parameters gracefully', () => {
    const searchParams = new URLSearchParams();

    const result = paramsToUserFilters(searchParams);

    expect(result).toEqual({
      roleType: undefined,
      searchQuery: undefined,
      showDeleted: false,
      withQualification: undefined,
      withoutQualification: undefined,
      onTeam: undefined,
      eventHours: undefined
    });
  });
});

describe('userFiltersToParams', () => {
  it('should convert a UserFilters object to URLSearchParams', () => {
    const filters: UserFilters = {
      roleType: 'admin',
      searchQuery: 'test',
      showDeleted: true,
      withQualification: 'certified',
      withoutQualification: 'uncertified',
      onTeam: 'team123',
      eventHours: undefined
    };

    const result = userFiltersToParams(filters);

    expect(result.toString()).toBe(
      'roleType=admin&searchQuery=test&showDeleted=true&withQualification=certified&withoutQualification=uncertified&onTeam=team123'
    );
  });

  it('should handle undefined values by removing corresponding parameters', () => {
    const filters = {
      roleType: undefined,
      searchQuery: undefined,
      showDeleted: false,
      withQualification: undefined,
      withoutQualification: undefined,
      onTeam: undefined,
      eventHours: undefined
    };

    const result = userFiltersToParams(filters);

    expect(result.toString()).toBe('');
  });

  it('should merge with existing URLSearchParams', () => {
    const filters: UserFilters = {
      roleType: 'admin',
      searchQuery: 'test',
      showDeleted: true,
      withQualification: undefined,
      withoutQualification: undefined,
      eventHours: undefined
    };
    const existingParams = new URLSearchParams({ page: '1', sort: 'asc' });

    const result = userFiltersToParams(filters, existingParams);

    expect(result.toString()).toBe(
      'page=1&sort=asc&roleType=admin&searchQuery=test&showDeleted=true'
    );
  });
});

describe('recordToUserFilters', () => {
  it('should convert a record to a UserFilters object', () => {
    const record = {
      roleType: 'admin',
      searchQuery: 'test',
      showDeleted: 'true',
      withQualification: 'certified',
      withoutQualification: 'uncertified',
      onTeam: 'team123',
      eventHours: undefined
    };

    const result = recordToUserFilters(record);

    expect(result).toEqual({
      roleType: 'admin',
      searchQuery: 'test',
      showDeleted: true,
      withQualification: 'certified',
      withoutQualification: 'uncertified',
      onTeam: 'team123',
      eventHours: undefined
    });
  });

  it('should handle missing or undefined values gracefully', () => {
    const record = {
      roleType: undefined,
      searchQuery: undefined,
      showDeleted: undefined,
      withQualification: undefined,
      withoutQualification: undefined,
      onTeam: undefined,
      eventHours: undefined
    };

    const result = recordToUserFilters(record);

    expect(result).toEqual({
      roleType: undefined,
      searchQuery: undefined,
      showDeleted: false,
      withQualification: undefined,
      withoutQualification: undefined,
      onTeam: undefined,
      eventHours: undefined
    });
  });

  it('should handle partial records', () => {
    const record = {
      roleType: 'user',
      searchQuery: undefined,
      showDeleted: 'false',
      withQualification: 'certified',
      withoutQualification: undefined,
      onTeam: undefined
    };

    const result = recordToUserFilters(record);

    expect(result).toEqual({
      roleType: 'user',
      searchQuery: undefined,
      showDeleted: false,
      withQualification: 'certified',
      withoutQualification: undefined,
      onTeam: undefined
    });
  });
});

describe('eventId and belowMinimumHours filters', () => {
  it('round-trips through URL params', () => {
    const filters = paramsToUserFilters(
      new URLSearchParams({ eventId: 'event-1', belowMinimumHours: 'true' })
    );
    expect(filters.eventId).toBe('event-1');
    expect(filters.belowMinimumHours).toBe(true);

    const params = userFiltersToParams(filters);
    expect(params.get('eventId')).toBe('event-1');
    expect(params.get('belowMinimumHours')).toBe('true');
  });

  it('reads them from a page searchParams record', () => {
    const filters = recordToUserFilters({ eventId: 'event-1', belowMinimumHours: 'true' });
    expect(filters.eventId).toBe('event-1');
    expect(filters.belowMinimumHours).toBe(true);
  });

  it('leaves them unset when absent or not "true"', () => {
    const filters = paramsToUserFilters(new URLSearchParams({ belowMinimumHours: 'false' }));
    expect(filters.eventId).toBeUndefined();
    expect(filters.belowMinimumHours).toBeUndefined();
    const params = userFiltersToParams(
      {},
      new URLSearchParams({ eventId: 'x', belowMinimumHours: 'true' })
    );
    expect(params.has('eventId')).toBe(false);
    expect(params.has('belowMinimumHours')).toBe(false);
  });
});

describe('cancelledTicket filter', () => {
  it('round-trips through URL params and page records', () => {
    const filters = paramsToUserFilters(new URLSearchParams({ cancelledTicket: 'true' }));
    expect(filters.cancelledTicket).toBe(true);
    expect(userFiltersToParams(filters).get('cancelledTicket')).toBe('true');
    expect(recordToUserFilters({ cancelledTicket: 'true' }).cancelledTicket).toBe(true);
  });

  it('is unset when absent', () => {
    expect(paramsToUserFilters(new URLSearchParams()).cancelledTicket).toBeUndefined();
    expect(
      userFiltersToParams({}, new URLSearchParams({ cancelledTicket: 'true' })).has(
        'cancelledTicket'
      )
    ).toBe(false);
  });
});
