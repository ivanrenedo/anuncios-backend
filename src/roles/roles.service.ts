import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRolInput } from './dto/create-rol.input';
import { UpdateRolInput } from './dto/update-rol.input';

const INCLUDE = { createdBy: true };

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.rol.findMany({
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const rol = await this.prisma.rol.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  async create(input: CreateRolInput, createdById?: string) {
    const { actions, ...rest } = input;
    const data: any = { ...rest, actions: actions ?? [] };
    if (createdById) data.createdById = createdById;
    return this.prisma.rol.create({ data, include: INCLUDE });
  }

  async update(id: string, input: UpdateRolInput) {
    const { actions, ...rest } = input;
    const data: any = { ...rest };
    if (actions) data.actions = actions;
    return this.prisma.rol.update({
      where: { id },
      data,
      include: INCLUDE,
    });
  }

  async remove(id: string) {
    return this.prisma.rol.delete({ where: { id } });
  }
}
