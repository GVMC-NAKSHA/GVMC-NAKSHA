import { Module } from '@nestjs/common';
import { DroneController } from './drone.controller';
@Module({ controllers: [DroneController] })
export class DroneModule {}
