import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptographyService } from '../cryptography/cryptography.service';
import { CryptographyKeyPairDto } from '../cryptography/dto/cryptography-keypair.dto';
import { User } from '../users/entities/users.entity';
import { UsersService } from '../users/users.service';
import { Contact } from './contacts.entity';
import ContactHandshakeDto from './dto/contact-handshake.dto';
import ContactDto from './dto/contact.dto';

@Injectable()
export class ContactsService {
  private readonly BASE_64 = 'base64';

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
    private readonly cryptographyService: CryptographyService,
    private readonly usersService: UsersService,
  ) {}

  async createContact(userId: number, name: string): Promise<Contact> {
    const user = await this.usersService.findById(userId, true);
    const oneUseKeyPair: CryptographyKeyPairDto = await this.cryptographyService.generateOneUseKeyPair();
    const contact = new Contact();
    contact.name = name;
    contact.user = user;
    contact.handshakePrivateKey = oneUseKeyPair.privateKey;
    contact.handshakePublicKey = oneUseKeyPair.publicKey;
    return this.contactsRepository.save(contact);
  }

  async getByUser(userId: number): Promise<ContactDto[]> {
    return this.contactsRepository.find({
      select: ['name'],
      where: { user: { id: userId } },
    });
  }

  async findOne(userId: number, name: string, orFail = false): Promise<Contact> {
    if (orFail) {
      return this.contactsRepository.findOneOrFail({ where: { user: { id: userId }, name } });
    } else {
      return this.contactsRepository.findOne({ where: { user: { id: userId }, name } });
    }
  }

  async findAll(): Promise<Contact[]> {
    return this.contactsRepository.find();
  }

  async findOneOrCreate(userId: number, name: string): Promise<Contact> {
    const contact = await this.contactsRepository.findOne({ where: { user: { id: userId }, name } });
    if (contact) {
      return contact;
    } else {
      return this.createContact(userId, name);
    }
  }

  async delete(name: string): Promise<void> {
    await this.contactsRepository.delete({ name });
  }

  async initHandshake(userId: number, contactName: string): Promise<ContactHandshakeDto> {
    const contact = await this.findOneOrCreate(userId, contactName);
    return this.generateHandshake(userId, contact);
  }

  async acceptInitHandshake(userId: number, contactName: string, handshake: ContactHandshakeDto): Promise<void> {
    const contact = await this.findOneOrCreate(userId, contactName);
    await this.receiveHandshake(contact, handshake);
  }

  async replyHandshake(userId: number, name: string): Promise<ContactHandshakeDto> {
    const contact = await this.contactsRepository.findOneOrFail({ where: { user: { id: userId }, name } });
    return this.generateHandshake(userId, contact);
  }

  async acceptReplyHandshake(userId: number, name: string, handshake: ContactHandshakeDto): Promise<void> {
    const contact = await this.contactsRepository.findOneOrFail({ where: { user: { id: userId }, name } });
    await this.receiveHandshake(contact, handshake);
  }

  private async generateHandshake(fromID: number, contact: Contact): Promise<ContactHandshakeDto> {
    const fromUser: User = await this.usersService.findById(fromID);
    const signature = await this.cryptographyService.generateSignature(
      contact.handshakePublicKey,
      fromUser.privateSigningKey,
    );
    const contactHandshake = new ContactHandshakeDto();
    contactHandshake.identifier = contact.identifier;
    contactHandshake.oneuseKey = contact.handshakePublicKey.toString(this.BASE_64);
    contactHandshake.signingKey = fromUser.publicSigningKey.toString(this.BASE_64);
    contactHandshake.signature = signature.toString(this.BASE_64);

    return contactHandshake;
  }

  private async receiveHandshake(contact: Contact, handshake: ContactHandshakeDto): Promise<void> {
    contact.identifier = handshake.identifier;
    contact.signingKey = Buffer.from(handshake.signingKey, this.BASE_64);
    contact.oneuseKey = Buffer.from(handshake.oneuseKey, this.BASE_64);
    contact.signature = Buffer.from(handshake.signature, this.BASE_64);

    // verify signature
    if (!(await this.cryptographyService.validateSignature(contact.signature, contact.oneuseKey, contact.signingKey))) {
      throw Error('signature mismatch');
    }

    await this.contactsRepository.save(contact);
  }
}