import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-my-academy',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './my-academy.component.html',
    styleUrls: ['./my-academy.component.scss']
})
export class MyAcademyComponent implements OnInit {

    constructor() { }

    ngOnInit(): void {
    }

}
