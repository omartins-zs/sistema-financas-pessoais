<?php

namespace App\Http\Requests;

use App\Enums\EntryStatus;
use App\Enums\EntryType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateFinancialEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'description' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', Rule::in(config('financial.categories'))],
            'type' => ['required', Rule::enum(EntryType::class)],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:999999999.99'],
            'status' => ['required', Rule::enum(EntryStatus::class)],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
