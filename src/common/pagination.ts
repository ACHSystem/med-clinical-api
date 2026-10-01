export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        totalElements: number;
        totalPages: number;
    };
}

export function toPaginatedResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
): PaginatedResult<T> {
    return {
        data,
        pagination: {
            page,
            limit,
            totalElements: total,
            totalPages: Math.ceil(total / limit),
        },
    };
}